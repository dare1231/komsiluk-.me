// Social collage renderer (1080x1080). Text is drawn with bundled Poppins fonts via sharp's `fontfile`,
// because the Vercel runtime has no system fonts (that produced empty squares before).
// Design: four full-bleed photos, no prices on purpose ("Cijena? U aplikaciji") so viewers open the app.
const sharp = require('sharp');
const path = require('path');

const FONT_REGULAR = path.join(__dirname, 'fonts', 'Poppins-Regular.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'Poppins-Bold.ttf');
const W = 1080, H = 1080;
const HEADER_H = 128, FOOTER_H = 112, GAP = 6;
const TILE_W = (W - GAP) / 2;                       // 537
const TILE_H = (H - HEADER_H - FOOTER_H - GAP) / 2; // 417
const BRAND = '#0f766e', ACCENT = '#facc15', INK = '#0b1220';

const xml = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (value, max) => { const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };
function wrapTwo(value, max) {
  const words = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().split(' ');
  let first = '';
  while (words.length && (first + ' ' + words[0]).trim().length <= max) first = (first + ' ' + words.shift()).trim();
  if (!first && words.length) first = clip(words.shift(), max);
  return [first, words.length ? clip(words.join(' '), max) : ''];
}

async function text(value, { size = 24, bold = false, color = '#0f172a' } = {}) {
  const buffer = await sharp({
    text: {
      text: `<span foreground="${color}">${xml(value)}</span>`,
      font: `Poppins ${bold ? 'Bold' : 'Regular'} ${size}`,
      fontfile: bold ? FONT_BOLD : FONT_REGULAR,
      rgba: true,
      wrap: 'none',
      dpi: 72
    }
  }).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return { input: buffer, width: meta.width, height: meta.height };
}

const svg = (width, height, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);

async function photo(buffer, w, h) {
  if (!buffer) return sharp({ create: { width: w, height: h, channels: 3, background: '#cbd5e1' } }).jpeg().toBuffer();
  try { return await sharp(buffer).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).modulate({ saturation: 1.12 }).jpeg({ quality: 90 }).toBuffer(); }
  catch { return sharp({ create: { width: w, height: h, channels: 3, background: '#cbd5e1' } }).jpeg().toBuffer(); }
}

// pill: rounded label with text centred inside
async function pill(layers, label, { x, y, size, bold = true, color, bg, padX = 18, padY = 8, right = false }) {
  const t = await text(label, { size, bold, color });
  const bw = t.width + padX * 2, bh = t.height + padY * 2;
  const left = right ? x - bw : x;
  layers.push({ input: svg(bw, bh, `<rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="${bg}"/>`), left: Math.round(left), top: Math.round(y) });
  layers.push({ input: t.input, left: Math.round(left + padX), top: Math.round(y + padY) });
  return { w: bw, h: bh };
}

// items: [{ name, place, price, isTemu, image: Buffer|null }] (up to 4); price is intentionally not drawn
async function buildCollage(items) {
  const layers = [];
  const add = (input, left, top) => layers.push({ input, left: Math.round(left), top: Math.round(top) });

  // header: brand + hook
  add(svg(W, HEADER_H, `<rect width="${W}" height="${HEADER_H}" fill="${INK}"/>`), 0, 0);
  const logo = await text('Komšiluk', { size: 46, bold: true, color: '#ffffff' });
  add(svg(18, 18, `<circle cx="9" cy="9" r="9" fill="${ACCENT}"/>`), 40, Math.round((HEADER_H - 18) / 2));
  add(logo.input, 70, Math.round((HEADER_H - logo.height) / 2));
  await pill(layers, 'NOVO DANAS', { x: W - 40, y: Math.round((HEADER_H - 50) / 2), size: 24, color: INK, bg: ACCENT, padX: 22, padY: 10, right: true });

  for (let i = 0; i < 4; i++) {
    const item = items[i] || {};
    const x = (i % 2) * (TILE_W + GAP);
    const y = HEADER_H + Math.floor(i / 2) * (TILE_H + GAP);

    add(await photo(item.image, TILE_W, TILE_H), x, y);
    // dark fade at the bottom so the title is readable on any photo
    add(svg(TILE_W, TILE_H, `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient></defs><rect width="${TILE_W}" height="${TILE_H}" fill="url(#f)"/>`), x, y);

    // curiosity tag instead of the price
    await pill(layers, 'Cijena? U aplikaciji', { x: x + 18, y: y + 18, size: 21, color: INK, bg: '#ffffff', padX: 16, padY: 7 });
    if (item.isTemu) await pill(layers, 'Temu', { x: x + TILE_W - 18, y: y + 18, size: 20, color: '#ffffff', bg: '#ea580c', padX: 14, padY: 7, right: true });

    if (!item.name) continue;
    const place = clip(item.place, 26);
    const pl = place ? await text(place, { size: 22, color: '#e2e8f0' }) : null;
    const [line1, line2] = wrapTwo(item.name, 24);
    const t1 = await text(line1, { size: 31, bold: true, color: '#ffffff' });
    const t2 = line2 ? await text(line2, { size: 31, bold: true, color: '#ffffff' }) : null;
    let by = y + TILE_H - 20;
    if (pl) { by -= pl.height; add(svg(12, 12, `<circle cx="6" cy="6" r="6" fill="${ACCENT}"/>`), x + 24, by + Math.round(pl.height / 2) - 5); add(pl.input, x + 44, by); by -= 4; }
    if (t2) { by -= t2.height; add(t2.input, x + 22, by); by -= 6; }
    by -= t1.height; add(t1.input, x + 22, by);
  }

  // footer: call to action
  const fy = H - FOOTER_H;
  add(svg(W, FOOTER_H, `<defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${BRAND}"/><stop offset="1" stop-color="#115e59"/></linearGradient></defs><rect width="${W}" height="${FOOTER_H}" fill="url(#c)"/>`), 0, fy);
  const cta = await text('Pogledaj cijene i kontakt', { size: 36, bold: true, color: '#ffffff' });
  add(cta.input, 40, fy + Math.round((FOOTER_H - cta.height) / 2));
  await pill(layers, 'LINK U BIO', { x: W - 40, y: fy + Math.round((FOOTER_H - 54) / 2), size: 26, color: INK, bg: ACCENT, padX: 24, padY: 10, right: true });

  return sharp({ create: { width: W, height: H, channels: 4, background: INK } }).composite(layers).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

module.exports = { buildCollage };
