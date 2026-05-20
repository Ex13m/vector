/**
 * Generate PNG icons from SVG sources for:
 *  - PWA manifest (public/)
 *  - Android TWA mipmap + drawable (android/app/src/main/res/)
 *
 * Usage: node scripts/generate-icons.mjs
 * Requires: npm install sharp
 */
import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pub = resolve(root, 'public');
const res = resolve(root, 'android', 'app', 'src', 'main', 'res');

// PWA manifest icon sizes
const pwaSizes = [192, 512];

// Android mipmap density buckets
const mipmapBuckets = [
  { folder: 'mipmap-mdpi',    size: 48  },
  { folder: 'mipmap-hdpi',    size: 72  },
  { folder: 'mipmap-xhdpi',   size: 96  },
  { folder: 'mipmap-xxhdpi',  size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function generate() {
  const iconSvg = readFileSync(resolve(pub, 'icon.svg'));
  const maskSvg = readFileSync(resolve(pub, 'icon-maskable.svg'));

  // ── PWA PNGs (public/) ──
  for (const size of pwaSizes) {
    await sharp(iconSvg).resize(size, size).png().toFile(resolve(pub, `icon-${size}.png`));
    await sharp(maskSvg).resize(size, size).png().toFile(resolve(pub, `icon-maskable-${size}.png`));
    console.log(`  PWA  ${size}x${size}`);
  }

  // ── Android mipmaps (launcher icon) ──
  for (const { folder, size } of mipmapBuckets) {
    const dir = resolve(res, folder);
    ensureDir(dir);
    await sharp(maskSvg).resize(size, size).png().toFile(resolve(dir, 'ic_launcher.png'));
    console.log(`  Android  ${folder}  ${size}x${size}`);
  }

  // ── Splash drawable (512x512) ──
  const drawDir = resolve(res, 'drawable');
  ensureDir(drawDir);
  await sharp(iconSvg).resize(512, 512).png().toFile(resolve(drawDir, 'splash.png'));
  console.log('  Android  drawable/splash.png  512x512');

  console.log('\nAll icons generated.');
}

generate().catch(err => { console.error(err); process.exit(1); });
