const sharp = require('sharp');
const GRAPH = 'https://graph.facebook.com/v21.0';
const CAPTION = 'Najnovije na aplikaciji · link u bio';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldmZsdHJsendtY3lxbnF1dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDUwNDYsImV4cCI6MjEwNDM4MTA0Nn0.f0xKPTOaeecm3OFNtO3qfdduDHf-FV47phgUExS5wI';
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || '';
const PAGE_ID = process.env.FB_PAGE_ID || process.env.META_PAGE_ID || '';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || process.env.IG_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID || process.env.META_IG_USER_ID || process.env.IG_ID;
const PUBLISH_TOKEN = process.env.META_PUBLISH_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN || process.env.IG_ACCESS_TOKEN || process.env.IG_TOKEN;
let resolvedPageToken = null;
async function isSupabaseUserToken(token) {
  if (!token || !process.env.SUPABASE_URL) return false;
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return response.ok;
}
async function getPageToken() {
  if (resolvedPageToken) return resolvedPageToken;
  const raw = encodeURIComponent(PAGE_ACCESS_TOKEN);
  const direct = await fetch(`${GRAPH}/${PAGE_ID}?fields=access_token&access_token=${raw}`);
  const directData = await direct.json();
  if (directData.access_token) return (resolvedPageToken = directData.access_token);
  const accounts = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&access_token=${raw}`);
  const accountData = await accounts.json();
  const page = (accountData.data || []).find(item => String(item.id) === String(PAGE_ID));
  resolvedPageToken = page?.access_token || PAGE_ACCESS_TOKEN;
  return resolvedPageToken;
}
const publicImage = img => img && img.startsWith('http') ? img : `${PUBLIC_SITE_URL}${img || '/assets/neutral-product.svg'}`;
async function supabase(path, options = {}) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) } });
  const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.message || text || `Supabase ${r.status}`); return data;
}
async function graph(path, body) {
  const r = await fetch(`${GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, access_token: await getPageToken() }) });
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
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const bySecret = Boolean(PUBLISH_TOKEN && authorization === `Bearer ${PUBLISH_TOKEN}`);
  const byCron = req.headers['x-vercel-cron'] === '1';
  const byLoggedInAdmin = !bySecret && !byCron && await isSupabaseUserToken(bearer);
  if (!bySecret && !byCron && !byLoggedInAdmin) return res.status(401).json({ error: 'Neautorizovan publish.' });
  if (!PAGE_ID || !PAGE_ACCESS_TOKEN || !IG_USER_ID || !PUBLIC_SITE_URL) return res.status(500).json({ error: 'Meta i PUBLIC_SITE_URL varijable nijesu podešene.' });
  try {
    const slot = slotKey();
    let hasPublishLog = true;
    let prior = [];
    try { prior = await supabase(`social_publish_runs?select=id&slot_key=eq.${encodeURIComponent(slot)}&limit=1`); }
    catch (e) { if (String(e.message).includes('social_publish_runs')) hasPublishLog = false; else throw e; }
    if (prior.length) return res.status(200).json({ ok: true, skipped: true, message: 'Objava za ovaj paket je već poslata.' });
    const ads = await supabase('oglasi?select=*&odobreno=eq.true&order=created_at.desc&limit=5');
    if (ads.length < 3) return res.status(200).json({ ok: true, skipped: true, message: 'Nema 3 lokalna oglasa za kolaž.' });
    let temuRows = [];
    try { temuRows = await supabase('temu_products?select=*&active=eq.true&order=last_published_at.asc.nullsfirst,created_at.asc&limit=1'); }
    catch (e) { if (!String(e.message).includes('temu_products')) throw e; }
    if (!temuRows.length) {
      const fallback = [
        { naziv: 'Električna kutija za ručak za automobil', cijena: '21,28 €', image_url: 'https://img.kwcdn.com/product/open/dc454ffbfdc844f1ba1eeab73f9f361e-goods.jpeg', affiliate_url: 'https://www.temu.com/me-en/car-specific-electric-lunch-box-compatible-with--12v-car-power-outlets-uses--temperature-heating-technology-can-quickly-heat-food-and-keep-meals-warm-non-food-contact-g-606289727985146.html?top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Fopen%2Fdc454ffbfdc844f1ba1eeab73f9f361e-goods.jpeg' },
        { naziv: 'Radio za vanredne situacije', cijena: '42,17 €', image_url: 'https://img.kwcdn.com/product/fancy/5ac9a871-a7de-4d15-9604-9c5e28626d4d.jpg', affiliate_url: 'https://www.temu.com/me-en/10000mah-37000-mwh-emergency-weather-radio-solar-hand-crank-portable-radio-with-am-fm--battery-operated-3-mode-flashlight-reading-lamp-sos-alarm-phone-charger-for-indoor-outdoor-emergency-g-601104593278176.html?top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F5ac9a871-a7de-4d15-9604-9c5e28626d4d.jpg' }
      ];
      temuRows = [fallback[new Date().getUTCDate() % fallback.length]];
    }
    const local = ads.slice(0, 3); const temu = temuRows[0]; const collage = await makeCollage(local, temu, slot); const imageUrl = await upload(collage, slot);
    const fb = await graph(`/${PAGE_ID}/photos`, { url: imageUrl, caption: CAPTION, published: 'true' });
    const media = await graph(`/${IG_USER_ID}/media`, { image_url: imageUrl, caption: CAPTION });
    const ig = await graph(`/${IG_USER_ID}/media_publish`, { creation_id: media.id });
    if (hasPublishLog && temu.id) {
      for (const o of local) await supabase('social_publish_runs', { method: 'POST', body: JSON.stringify({ slot_key: slot, oglas_id: o.id, temu_product_id: temu.id, facebook_post_id: fb.id || null, instagram_media_id: ig.id || null, caption: CAPTION }) });
      await supabase(`temu_products?id=eq.${temu.id}`, { method: 'PATCH', body: JSON.stringify({ last_published_at: new Date().toISOString() }) });
    }
    return res.status(200).json({ ok: true, published: true, slot, local_ads: local.map(o => o.id), temu_product: temu.naziv, facebook: fb.id, instagram: ig.id, log_saved: hasPublishLog });
  } catch (error) { console.error(error); return res.status(500).json({ error: error.message }); }
};
