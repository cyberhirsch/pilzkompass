// Renders the mushroom SVG into the source images @capacitor/assets expects in app/assets/.
// Usage (from app/): node assets/src/render.mjs && npx capacitor-assets generate --android
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const dir = new URL('../', import.meta.url);
const mushroom = await readFile(new URL('./mushroom.svg', import.meta.url));
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
  <defs><radialGradient id="g" cx="50%" cy="42%" r="70%">
    <stop offset="0" stop-color="#3f6136"/><stop offset="1" stop-color="#1c2d1a"/>
  </radialGradient></defs>
  <rect width="1024" height="1024" fill="url(#g)"/></svg>`);

const png = (svg, size) => sharp(svg, { density: 72 * size / 1024 }).resize(size, size).png();

await png(mushroom, 1024).toFile(new URL('icon-foreground.png', dir).pathname.slice(1));
await png(background, 1024).toFile(new URL('icon-background.png', dir).pathname.slice(1));
await sharp(await png(background, 1024).toBuffer())
  .composite([{ input: await png(mushroom, 1024).toBuffer() }])
  .toFile(new URL('icon-only.png', dir).pathname.slice(1));

// Splash: mushroom centred on the app's dark background.
for (const name of ['splash.png', 'splash-dark.png']) {
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: '#14110d' } })
    .composite([{ input: await png(mushroom, 1100).toBuffer(), gravity: 'center' }])
    .png().toFile(new URL(name, dir).pathname.slice(1));
}
console.log('rendered');
