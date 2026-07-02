import type { Config } from 'tailwindcss';
export default { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'], theme: { extend: { colors: { brand: '#1E40AF', orange: '#F97316', ink: '#0F172A', mist: '#F8FAFC' }, boxShadow: { soft: '0 16px 45px rgba(15,23,42,.08)' } } }, plugins: [] } satisfies Config;
