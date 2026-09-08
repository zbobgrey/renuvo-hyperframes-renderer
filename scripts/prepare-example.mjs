import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = resolve(root, 'example-project', 'vendor');
const mediaDir = resolve(root, 'example-project', 'media');
mkdirSync(vendorDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });
copyFileSync(resolve(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), resolve(vendorDir, 'gsap.min.js'));
copyFileSync(resolve(root, 'assets', 'brand', 'renuvo-lockup-horizontal-ivory.svg'), resolve(mediaDir, 'renuvo-lockup-horizontal-ivory.svg'));
copyFileSync(resolve(root, 'assets', 'brand', 'renuvo-lockup-horizontal-ink.svg'), resolve(mediaDir, 'renuvo-lockup-horizontal-ink.svg'));
copyFileSync(resolve(root, 'assets', 'audio', 'music-bed-60s.wav'), resolve(mediaDir, 'music-bed-60s.wav'));
if (!existsSync(resolve(mediaDir, 'narration.mp3'))) {
  console.warn('example-project/media/narration.mp3 is absent; generate it before a local audio render.');
}
console.log('Prepared vendored GSAP, Renuvo logos, and the original music bed.');
