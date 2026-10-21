const GRAPH = 'https://graph.facebook.com/v21.0';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://revfltrlzwmcyqnquvfa.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldmZsdHJsendtY3lxbnF1dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDUwNDYsImV4cCI6MjEwNDM4MTA0Nn0.f0xKPTOaeecm3OFNtO3qfdduDHf-FvV47phgUExS5wI';

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || text || `Supabase ${response.status}`);
  return data;
}

async function authenticatedUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || !ANON_KEY) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: auth },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return String(user?.email || '').toLowerCase() === (process.env.ADMIN_EMAIL || '71ageman49@gmail.com').toLowerCase() ? user : null;
}

function htmlMeta(html, property) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["'][^>]*>`, 'i');
  return (html.match(pattern) || html.match(reverse))?.[1]?.replace(/&amp;/g, '&').trim() || '';
}

function cleanText(value, fallback) {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function translateToLocal(text) {
  // Besplatni Google prevod na bosanski/crnogorski (latinica). Ako ne uspije, ostaje original.
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=bs&dt=t&q=' + encodeURIComponent(text);
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return text;
    const data = await r.json();
    const out = (data?.[0] || []).map(part => part?.[0] || '').join('').replace(/\s+/g, ' ').trim();
    return out || text;
  } catch { return text; }
}

function formatPrice(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const num = raw.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace('.', ',');
  if (!/\d/.test(num)) return '';
  return `${num} €`;
}

async function readProduct(item, index) {
  const n = index + 1;
  const link = String(item.link || '').trim();
  const url = new URL(link);
  if (!/temu\.com$/i.test(url.hostname) && !/\.temu\.com$/i.test(url.hostname)) throw new Error(`Link ${n} nije Temu link.`);
  let html = '';
  try {
    const response = await fetch(link, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (response.ok) html = await response.text();
  } catch { /* Temu može blokirati server; tada koristimo ono što je ručno upisano. */ }

  const manualName = cleanText(item.naziv, '');
  const autoName = cleanText(htmlMeta(html, 'og:title'), '');
  const sourceName = manualName || autoName;
  if (!sourceName) throw new Error(`Proizvod ${n}: Temu nije dao naziv. Upiši naziv u polje.`);
  const naziv = manualName ? sourceName : await translateToLocal(sourceName);

  const cijena = formatPrice(item.cijena) || formatPrice(htmlMeta(html, 'product:price:amount'));
  if (!cijena) throw new Error(`Proizvod ${n}: upiši cijenu (npr. 12,50).`);

  const image = String(item.image_url || '').trim() || htmlMeta(html, 'og:image');
  if (!image) throw new Error(`Proizvod ${n}: dodaj sliku proizvoda.`);

  return { naziv, cijena, image_url: image, affiliate_url: link, active: true };
}

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Supabase varijable nijesu podešene.' });
  if (!(await authenticatedUser(req))) return res.status(401).json({ error: 'Prijavite se u admin panel.' });
  try {
    if (req.method === 'GET') {
      const rows = await supabase('temu_products?select=id,naziv,cijena,image_url,affiliate_url,active,last_published_at,created_at&active=eq.true&order=created_at.desc&limit=3');
      return res.status(200).json({ ok: true, products: rows });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    let items = Array.isArray(body.items) ? body.items : (Array.isArray(body.links) ? body.links.map(link => ({ link })) : []);
    items = items.map(v => ({ ...v, link: String(v?.link || '').trim() })).filter(v => v.link).slice(0, 3);
    if (items.length !== 3) return res.status(400).json({ error: 'Unesite tačno 3 Temu linka.' });
    const products = [];
    for (let i = 0; i < items.length; i++) products.push(await readProduct(items[i], i));
    const imgs = new Set(products.map(p => p.image_url));
    if (imgs.size < products.length) return res.status(400).json({ error: 'Dva proizvoda imaju istu sliku. Dodaj posebnu sliku za svaki proizvod.' });
    await supabase('temu_products?active=eq.true', { method: 'PATCH', body: JSON.stringify({ active: false }) });
    const saved = await supabase('temu_products', { method: 'POST', body: JSON.stringify(products) });
    return res.status(200).json({ ok: true, products: saved });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message || 'Temu proizvodi nijesu sačuvani.' });
  }
};
