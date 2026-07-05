import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standaloneDir = join(root, '.next', 'standalone');

if (!existsSync(standaloneDir)) {
  throw new Error('Standalone build was not generated. Check next.config.mjs.');
}

const staticSource = join(root, '.next', 'static');
const staticDestination = join(standaloneDir, '.next', 'static');

mkdirSync(join(standaloneDir, '.next'), { recursive: true });
cpSync(staticSource, staticDestination, { recursive: true, force: true });

const publicSource = join(root, 'public');
if (existsSync(publicSource)) {
  cpSync(publicSource, join(standaloneDir, 'public'), {
    recursive: true,
    force: true,
  });
}

console.log('Copied Next.js static assets into the standalone deployment bundle.');
