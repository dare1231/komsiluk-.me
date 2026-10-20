// Social collage renderer (1080x1080). Text is drawn with bundled Poppins fonts via sharp's `fontfile`,
// because the Vercel runtime has no system fonts (that produced empty squares before).
const sharp = require('sharp');
const path = require('path');

const FONT_REGULAR = path.join(__dirname, 'fonts', 'Poppins-Regular.ttf');
const FONT_BOLD = path.join(__dirname, 'fonts', 'Poppins-Bold.ttf');
const W = 1080, H = 1080;
const MARGIN = 36, GAP = 24, HEADER_H = 186;
const CARD_W = (W - MARGIN * 2 - GAP) / 2;            // 492
const CARD_H = (H - HEADER_H - 30 - MARGIN - GAP) / 2; // ~402
const IMG_H = 262, RADIUS = 26;

const xml = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (value, max) => { const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; };
function wrapTwo(value, max) {
  const words = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().split(' ');
  let first = '';
  while (words.length && (first + ' ' + words[0]).trim().length <= max) first = (first + ' ' + words.shift()).trim();
  if (!first && words.length) first = clip(words.shift(), max);
  return [first, words.length ? clip(words.join(' '), max) : ''];
}
const formatPrice = value => {
  const s = String(value == null ? '' : value).trim();
  if (!s) return '';
  return /^[\d.,\s]+$/.test(s) ? `${s} €` : s;
};

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
const topRounded = (w, h, r) => svg(w, h, `<path d="M0 ${h}V${r}Q0 0 ${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h}Z" fill="#fff"/>`);

async function photo(buffer, w, h) {
  if (!buffer) return sharp({ create: { width: w, height: h, channels: 3, background: '#e2e8f0' } }).jpeg().toBuffer();
  try { return await sharp(buffer).rotate().resize(w, h, { fit: 'cover', position: 'attention' }).jpeg({ quality: 90 }).toBuffer(); }
  catch { return sharp({ create: { width: w, height: h, channels: 3, background: '#e2e8f0' } }).jpeg().toBuffer(); }
}

// items: [{ name, place, price, isTemu, image: Buffer|null }] (up to 4)
async function buildCollage(items) {
  const layers = [];
  const add = (input, left, top) => layers.push({ input, left: Math.round(left), top: Math.round(top) });

  // header
  const headerBg = svg(W, HEADER_H, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#134e4a"/></linearGradient></defs><rect width="${W}" height="${HEADER_H}" fill="url(#g)"/><circle cx="${W - 70}" cy="30" r="150" fill="#ffffff" fill-opacity="0.06"/><circle cx="${W - 230}" cy="170" r="80" fill="#ffffff" fill-opacity="0.05"/>`);
  add(headerBg, 0, 0);
  const title = await text('Najnovije na aplikaciji', { size: 50, bold: true, color: '#ffffff' });
  add(title.input, MARGIN + 6, 34);
  const sub = await text('4 proizvoda · link u bio', { size: 28, color: '#99f6e4' });
  add(sub.input, MARGIN + 8, 108);

  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const item = items[i];
    const x = MARGIN + (i % 2) * (CARD_W + GAP);
    const y = HEADER_H + 30 + Math.floor(i / 2) * (CARD_H + GAP);

    // soft shadow + white card
    const shadow = await sharp(svg(CARD_W + 40, CARD_H + 40, `<rect x="20" y="26" width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" fill="#0f172a" fill-opacity="0.16"/>`)).blur(9).png().toBuffer();
    add(shadow, x - 20, y - 14);
    add(svg(CARD_W, CARD_H, `<rect width="${CARD_W}" height="${CARD_H}" rx="${RADIUS}" fill="#ffffff"/>`), x, y);

    // photo with rounded top corners
    const img = await photo(item.image, CARD_W, IMG_H);
    const maskedImg = await sharp(img).ensureAlpha().composite([{ input: topRounded(CARD_W, IMG_H, RADIUS), blend: 'dest-in' }]).png().toBuffer();
    add(maskedImg, x, y);

    // price badge (bottom-left of photo)
    const price = formatPrice(item.price);
    if (price) {
      const p = await text(price, { size: 28, bold: true, color: '#ffffff' });
      const bw = p.width + 36, bh = p.height + 14;
      add(svg(bw, bh, `<rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="#f97316"/>`), x + 18, y + IMG_H - bh - 16);
      add(p.input, x + 18 + 18, y + IMG_H - bh - 16 + 7);
    }
    // Temu tag (top-right of photo)
    if (item.isTemu) {
      const t = await text('Temu', { size: 22, bold: true, color: '#ffffff' });
      const bw = t.width + 28, bh = t.height + 10;
      add(svg(bw, bh, `<rect width="${bw}" height="${bh}" rx="${bh / 2}" fill="#0f172a" fill-opacity="0.85"/>`), x + CARD_W - bw - 16, y + 16);
      add(t.input, x + CARD_W - bw - 16 + 14, y + 16 + 5);
    }

    // title (up to two lines) + place pinned to the bottom of the card
    const [line1, line2] = wrapTwo(item.name, 23);
    const t1 = await text(line1, { size: 28, bold: true, color: '#0f172a' });
    add(t1.input, x + 22, y + IMG_H + 14);
    if (line2) { const t2 = await text(line2, { size: 28, bold: true, color: '#0f172a' }); add(t2.input, x + 22, y + IMG_H + 14 + 40); }
    const place = await text(clip(item.place, 30), { size: 23, color: '#475569' });
    const py = y + CARD_H - place.height - 16;
    add(svg(14, 14, '<circle cx="7" cy="7" r="6" fill="#0f766e"/>'), x + 24, py + Math.round(place.height / 2) - 3);
    add(place.input, x + 46, py);
  }

  return sharp({ create: { width: W, height: H, channels: 4, background: '#eef2f7' } }).composite(layers).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}

module.exports = { buildCollage };
