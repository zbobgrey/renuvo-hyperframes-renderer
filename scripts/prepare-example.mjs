import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = resolve(root, 'example-project', 'vendor');
mkdirSync(vendorDir, { recursive: true });
copyFileSync(resolve(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), resolve(vendorDir, 'gsap.min.js'));
console.log('Prepared example-project/vendor/gsap.min.js');
