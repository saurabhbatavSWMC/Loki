import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const svgPath = resolve(projectRoot, 'public', 'icon.svg');
const outDir = resolve(projectRoot, 'public');
const splashDir = resolve(projectRoot, 'public', 'splash');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
if (!existsSync(splashDir)) mkdirSync(splashDir, { recursive: true });

const svg = readFileSync(svgPath);

// 1) Square icons used by manifest + Apple touch icon
const sizes = [
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

for (const { name, size } of sizes) {
  const out = resolve(outDir, name);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`Wrote ${out}`);
}

// 2) iOS splash screens — we generate the canvas at the device pixel size
// and centre a 28% logo on top of the brand background colour. Sizes cover
// the most common iPhones currently in active use.
const PAPER = '#F0EBDF';

const iosSplashes = [
  // [width, height, label]  (portrait, @2x/@3x device pixels)
  [1290, 2796, 'iphone-15-pro-max'], // also 14 Pro Max
  [1179, 2556, 'iphone-15-pro'],     // also 14 Pro
  [1170, 2532, 'iphone-13-pro'],
  [1284, 2778, 'iphone-13-pro-max'],
  [1125, 2436, 'iphone-x'],
  [828,  1792, 'iphone-xr'],
  [750,  1334, 'iphone-8'],
  [1242, 2208, 'iphone-8-plus'],
  [1620, 2160, 'ipad-10-2'],
  [1668, 2388, 'ipad-pro-11'],
];

for (const [w, h, label] of iosSplashes) {
  const logoSize = Math.round(Math.min(w, h) * 0.28);
  const logoPng = await sharp(svg, { density: 384 }).resize(logoSize, logoSize).png().toBuffer();
  const out = resolve(splashDir, `${label}-${w}x${h}.png`);
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: PAPER,
    },
  })
    .composite([
      {
        input: logoPng,
        top: Math.round((h - logoSize) / 2),
        left: Math.round((w - logoSize) / 2),
      },
    ])
    .png()
    .toFile(out);
  console.log(`Wrote ${out}`);
}

console.log('Icons + splash images generated. Add splash <link>s to index.html if not already present.');
