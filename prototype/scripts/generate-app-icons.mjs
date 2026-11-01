import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// Keep the approved folded-page geometry as the only logo source. The opaque
// square lets iOS/Android apply their own corner or circle masks consistently.
const mark = await readFile(new URL('../src/assets/luli-mark.svg', import.meta.url), 'utf8');
const paths = [...mark.matchAll(/<path\b[^>]*\/>/g)].map(match => match[0]).join('\n');
if (!paths) throw new Error('The source logo has no paths.');

export function appIconSvg(maskable = false) {
  const scale = maskable ? 6.4 : 7.4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#151515"/>
    <g fill="#fafafa" transform="translate(${256 - 26 * scale} ${256 - 24 * scale}) scale(${scale})">${paths}</g>
  </svg>`;
}

const output = new URL('../public/', import.meta.url);
await mkdir(new URL('icons/', output), { recursive: true });
for (const [name, size, maskable] of [
  ['apple-touch-icon.png', 180, false],
  ['icons/favicon-32-v1.png', 32, false],
  ['icons/luli-192-v1.png', 192, false],
  ['icons/luli-512-v1.png', 512, false],
  ['icons/luli-maskable-512-v1.png', 512, true],
]) {
  const png = new Resvg(appIconSvg(maskable), { fitTo: { mode: 'width', value: size } }).render().asPng();
  await writeFile(new URL(name, output), png);
  console.log(`${name} · ${size} × ${size}`);
}
