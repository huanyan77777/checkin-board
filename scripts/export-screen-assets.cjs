// Development-only: retain original artwork; no AI redraw or PSD modification.
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const base = path.resolve(__dirname, '..');
async function main() {
  const source = path.join(base, 'public/assets/department-icons.png');
  const ids = ['learning', 'office', 'arts', 'sports', 'publicity', 'rights'];
  for (let i = 0; i < 6; i++) {
    const left = i === 1 ? 544 : (i % 3) * 512;
    const width = i === 0 ? 544 : i === 1 ? 480 : 512;
    await sharp(source).extract({left, top: Math.floor(i/3)*512, width, height:512})
      .resize(400,400,{fit:'inside'}).png().toFile(path.join(base, 'public/assets', ids[i]+'.png'));
  }
  await sharp(path.join(base, 'public/assets/board-preview.png'))
    .extract({left:132, top:130, width:232, height:232})
    .png().toFile(path.join(base, 'public/assets/logo.png'));
}
main().catch(e => { console.error(e); process.exitCode=1; });
