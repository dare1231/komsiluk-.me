const sharp = require('sharp');
const GRAPH = 'https://graph.facebook.com/v21.0';
const CAPTION = 'Najnovije na aplikaciji · link u bio';
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || '';
const publicImage = img => img && img.startsWith('http') ? img : `${PUBLIC_SITE_URL}${img || '/assets/neutral-product.svg'}`;
async function supabase(path, options = {}) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) } });
  const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.message || text || `Supabase ${r.status}`); return data;
}
async function graph(path, body) {
  const r = await fetch(`${GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, access_token: process.env.META_PAGE_ACCESS_TOKEN }) });
  const data = await r.json(); if (!r.ok || data.error) throw new Error(data.error?.message || `Meta Graph API ${r.status}`); return data;
}
const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function download(url) { const r = await fetch(url); if (!r.ok) throw new Error(`Slika nije dostupna: ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function makeCollage(localAds, temu, slot) {
  const items = [{ ...temu, mjesto: 'Temu' }, ...localAds.map(o => ({ ...o, mjesto: o.grad }))];
  const cardW = 520, cardH = 300, startY = 180;
  const layers = [];
  for (let i = 0; i < items.length; i++) {
    const resized = await sharp(await download(publicImage(items[i].img || items[i].image_url))).resize(cardW, cardH, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
    layers.push({ input: resized, left: (i % 2) * 540 + 10, top: Math.floor(i / 2) * 390 + startY });
  }
  const labels = items.map((o, i) => { const x = (i % 2) * 540 + 24, y = Math.floor(i / 2) * 390 + startY; return `<text x="${x}" y="${y + 332}" fill="#0f172a" font-family="Arial" font-size="24" font-weight="700">${esc(String(o.naziv || o.name).slice(0, 34))}</text><text x="${x}" y="${y + 360}" fill="#475569" font-family="Arial" font-size="19">${esc(String(o.mjesto || '').slice(0, 44))}</text>`; }).join('');
  const header = Buffer.from(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1080" fill="#f8fafc"/><rect width="1080" height="155" fill="#0f766e"/><text x="54" y="70" fill="white" font-family="Arial" font-size="39" font-weight="700">Najnovije na aplikaciji</text><text x="54" y="119" fill="#d1fae5" font-family="Arial" font-size="25">4 proizvoda · link u bio</text>${labels}</svg>`);
  return sharp({ create: { width: 1080, height: 1080, channels: 4, background: '#f8fafc' } }).composite([{ input: header }, ...layers]).jpeg({ quality: 90 }).toBuffer();
}
async function upload(buffer, slot) {
  const path = `social-collages/${slot}.jpg`;
  const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/oglasi-slike/${path}`, { method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: buffer });
  if (!r.ok) throw new Error(`Ne mogu sačuvati kolaž (${r.status}).`);
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/oglasi-slike/${path}`;
}
function slotKey() { const d = new Date(); return `${d.toISOString().slice(0, 10)}-${String(d.getUTCHours()).padStart(2, '0')}`; }
module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== `Bearer ${process.env.META_PUBLISH_TOKEN}` && req.headers['x-vercel-cron'] !== '1') return res.status(401).json({ error: 'Neautorizovan publish.' });
  if (!process.env.META_PAGE_ID || !process.env.META_PAGE_ACCESS_TOKEN || !process.env.META_IG_USER_ID || !PUBLIC_SITE_URL) return res.status(500).json({ error: 'Meta i PUBLIC_SITE_URL varijable nijesu podešene.' });
  try {
    const slot = slotKey();
    const prior = await supabase(`social_publish_runs?select=id&slot_key=eq.${encodeURIComponent(slot)}&limit=1`);
    if (prior.length) return res.status(200).json({ ok: true, skipped: true, message: 'Objava za ovaj paket je već poslata.' });
    const ads = await supabase('oglasi?select=*&odobreno=eq.true&order=created_at.desc&limit=5');
    if (ads.length < 3) return res.status(200).json({ ok: true, skipped: true, message: 'Nema 3 lokalna oglasa za kolaž.' });
    const temuRows = await supabase('temu_products?select=*&active=eq.true&order=last_published_at.asc.nullsfirst,created_at.asc&limit=1');
    if (!temuRows.length) return res.status(200).json({ ok: true, skipped: true, message: 'Nema Temu proizvoda.' });
    const local = ads.slice(0, 3); const temu = temuRows[0]; const collage = await makeCollage(local, temu, slot); const imageUrl = await upload(collage, slot);
    const fb = await graph(`/${process.env.META_PAGE_ID}/photos`, { url: imageUrl, caption: CAPTION, published: 'true' });
    const media = await graph(`/${process.env.META_IG_USER_ID}/media`, { image_url: imageUrl, caption: CAPTION });
    const ig = await graph(`/${process.env.META_IG_USER_ID}/media_publish`, { creation_id: media.id });
    for (const o of local) await supabase('social_publish_runs', { method: 'POST', body: JSON.stringify({ slot_key: slot, oglas_id: o.id, temu_product_id: temu.id, facebook_post_id: fb.id || null, instagram_media_id: ig.id || null, caption: CAPTION }) });
    await supabase(`temu_products?id=eq.${temu.id}`, { method: 'PATCH', body: JSON.stringify({ last_published_at: new Date().toISOString() }) });
    return res.status(200).json({ ok: true, published: true, slot, local_ads: local.map(o => o.id), temu_product: temu.id, facebook: fb.id, instagram: ig.id });
  } catch (error) { console.error(error); return res.status(500).json({ error: error.message }); }
};
