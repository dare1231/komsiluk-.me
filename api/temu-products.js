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

async function readProduct(link, index) {
  const url = new URL(link);
  if (!/temu\.com$/i.test(url.hostname) && !/\.temu\.com$/i.test(url.hostname)) throw new Error(`Link ${index + 1} nije Temu link.`);
  let html = '';
  try {
    const response = await fetch(link, { headers: { 'user-agent': 'Mozilla/5.0' }, redirect: 'follow' });
    if (response.ok) html = await response.text();
  } catch { /* Temu može blokirati server; link se i dalje čuva. */ }
  const title = cleanText(htmlMeta(html, 'og:title'), `Temu proizvod ${index + 1}`);
  const image = htmlMeta(html, 'og:image') || 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80';
  const price = cleanText(htmlMeta(html, 'product:price:amount'), 'Pogledaj cijenu na Temu');
  return { naziv: title, cijena: price, image_url: image, affiliate_url: link, active: true };
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
    const links = Array.isArray(body.links) ? body.links.map(v => String(v || '').trim()).filter(Boolean).slice(0, 3) : [];
    if (links.length !== 3) return res.status(400).json({ error: 'Unesite tačno 3 Temu linka.' });
    const products = [];
    for (let i = 0; i < links.length; i++) products.push(await readProduct(links[i], i));
    await supabase('temu_products?active=eq.true', { method: 'PATCH', body: JSON.stringify({ active: false }) });
    const saved = await supabase('temu_products', { method: 'POST', body: JSON.stringify(products) });
    return res.status(200).json({ ok: true, products: saved });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message || 'Temu proizvodi nijesu sačuvani.' });
  }
};
