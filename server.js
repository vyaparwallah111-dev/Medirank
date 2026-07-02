// server.js — place at project root, run with `node server.js`
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = '0.0.0.0'; // always bind TCP, ignore any socket-path hostname string Hostinger injects
const dev = process.env.NODE_ENV !== 'production';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Prevent instant-crash restart loops: catch anything that would otherwise
// kill the process before OpenLiteSpeed's watchdog respawns it endlessly.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

app.prepare()
  .then(() => {
    createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    })
      .once('error', (err) => {
        console.error('[server error]', err);
        process.exit(1);
      })
      .listen(port, hostname, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
      });
  })
  .catch((err) => {
    console.error('[app.prepare() failed]', err);
    // Delay exit so the process manager doesn't hammer-restart every 1-2s
    setTimeout(() => process.exit(1), 5000);
  });