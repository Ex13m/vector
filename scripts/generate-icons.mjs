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
  // ВАЖНО: на Android 8+ реальную иконку рисует adaptive-XML (mipmap-anydpi-v26),
  // который берёт ic_launcher_foreground — генерим и его, и round, иначе на
  // телефоне остаётся старая иконка при обновлённых png (баг «иконка не та»).
  for (const { folder, size } of mipmapBuckets) {
    const dir = resolve(res, folder);
    ensureDir(dir);
    await sharp(maskSvg).resize(size, size).png().toFile(resolve(dir, 'ic_launcher.png'));
    await sharp(maskSvg).resize(size, size).png().toFile(resolve(dir, 'ic_launcher_round.png'));
    // Foreground-слой adaptive-иконки: холст 108dp против 48dp базы (×2.25).
    // Маскируемый SVG (лого в safe-zone) кладём full-bleed — системная маска
    // срежет края так же, как PWA-маска: иконка = как в вебе, консистентно.
    const fg = Math.round(size * 2.25);
    await sharp(maskSvg).resize(fg, fg).png().toFile(resolve(dir, 'ic_launcher_foreground.png'));
    console.log(`  Android  ${folder}  ${size}x${size} (+round, +foreground ${fg})`);
  }

  // ── Splash drawable (512x512) ──
  const drawDir = resolve(res, 'drawable');
  ensureDir(drawDir);
  await sharp(iconSvg).resize(512, 512).png().toFile(resolve(drawDir, 'splash.png'));
  console.log('  Android  drawable/splash.png  512x512');

  console.log('\nAll icons generated.');
}

generate().catch(err => { console.error(err); process.exit(1); });
