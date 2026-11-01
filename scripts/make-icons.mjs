// Generates PWA icons from the prototype's wallet glyph on the copper accent background.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const glyph = '<path d="M4 7.5h15a1 1 0 0 1 1 1V19H5a1 1 0 0 1-1-1V6.5L15.5 4v3.5M16 13.5h.01" stroke-width="1.9"/>';
const svg = (size, scale, rounded) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" ${rounded ? `rx="${size * 0.22}"` : ''} fill="#B05F26"/>
<g transform="translate(${(size - 24 * scale) / 2} ${(size - 24 * scale) / 2}) scale(${scale})" fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;

await mkdir('public/icons', { recursive: true });
// maskable: full-bleed square, glyph inside the 80% safe zone. Others: same (iOS rounds apple-touch itself).
const targets = [
  ['icon-192.png', 192, 192 / 24 * 0.5],
  ['icon-512.png', 512, 512 / 24 * 0.5],
  ['maskable-512.png', 512, 512 / 24 * 0.45],
  ['apple-touch-icon-180.png', 180, 180 / 24 * 0.5],
];
for (const [file, size, scale] of targets) {
  await sharp(Buffer.from(svg(size, scale, false))).png().toFile(`public/icons/${file}`);
}
