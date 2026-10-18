const ALLOWED_CITIES = new Set(['Podgorica', 'Bar', 'Nikšić', 'Budva', 'Kotor']);
const MAX_ADS = 5;
const MAX_AGE_DAYS = 3;
const DELETE_OLDEST = 3;
const WATERMARK_RE = /(watermark|water-mark|logo|facebook|instagram|olx|patuljak|oglasi|kupujem|prodajem)/i;
const FALLBACK_IMAGE = process.env.NEUTRAL_IMAGE_URL || '/assets/neutral-product.svg';

function cleanPhone(value) { return String(value || '').trim().replace(/[^+0-9()\-\s]/g, ''); }
function validAd(ad) {
  const created = new Date(ad.created_at || Date.now());
  const age = (Date.now() - created.getTime()) / 86400000;
  return Boolean(ad.naziv && String(ad.cijena ?? ad.cena).trim() && cleanPhone(ad.telefon).length >= 5 && ALLOWED_CITIES.has(ad.grad) && age >= -0.25 && age <= MAX_AGE_DAYS);
}
function normalized(ad) {
  return {
    grad: ad.grad, kvart: ad.kvart || 'Centar', dist_km: Number(ad.dist_km) || 0.2,
    naziv: String(ad.naziv).trim(), cena: String(ad.cijena ?? ad.cena).trim(), telefon: cleanPhone(ad.telefon),
    img: WATERMARK_RE.test(String(ad.img || '')) ? FALLBACK_IMAGE : (ad.img || FALLBACK_IMAGE), top: ad.top || '35%', left: ad.left || '40%', odobreno: true,
    izvorni_link: ad.izvorni_link || null, created_at: ad.created_at || new Date().toISOString()
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.hint || text || `Supabase ${response.status}`);
  return data;
}

async function getAdsFromSource() {
  if (!process.env.DAILY_ADS_SOURCE_URL) throw new Error('DAILY_ADS_SOURCE_URL nije podešen.');
  const response = await fetch(process.env.DAILY_ADS_SOURCE_URL, { headers: process.env.DAILY_ADS_SOURCE_TOKEN ? { Authorization: `Bearer ${process.env.DAILY_ADS_SOURCE_TOKEN}` } : {} });
  if (!response.ok) throw new Error(`Izvor oglasa nije dostupan (${response.status}).`);
  const body = await response.json();
  return Array.isArray(body) ? body : body.ads;
}

module.exports = async (req, res) => {
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== `Bearer ${process.env.DAILY_IMPORT_TOKEN}` && req.headers['x-vercel-cron'] !== '1') return res.status(401).json({ error: 'Neautorizovan dnevni uvoz.' });
  try {
    const runDate = new Date().toISOString().slice(0, 10);
    const existingRun = await supabase(`daily_import_runs?select=id,added_count,deleted_count&run_date=eq.${runDate}&limit=1`);
    if (existingRun.length) return res.status(200).json({ ok: true, skipped: true, message: 'Dnevni uvoz je već izvršen.', run: existingRun[0] });
    const ads = req.method === 'GET' ? await getAdsFromSource() : (Array.isArray(req.body) ? req.body : req.body?.ads);
    if (!Array.isArray(ads) || ads.length !== MAX_ADS) return res.status(400).json({ error: 'Dnevni paket mora sadržati tačno 5 oglasa.' });
    const normalizedAds = ads.map(normalized);
    if (normalizedAds.some((ad, i) => !validAd({ ...ads[i], ...ad }))) return res.status(400).json({ error: 'Svi oglasi moraju biti mlađi od 3 dana, iz jednog od pet gradova i imati naziv, cijenu, telefon i fotografiju bez tuđeg loga/vodenog žiga.' });
    const oldest = await supabase('oglasi?select=id&order=created_at.asc&limit=8');
    if (oldest.length >= DELETE_OLDEST) await supabase(`oglasi?id=in.(${oldest.slice(0, DELETE_OLDEST).map(row => row.id).join(',')})`, { method: 'DELETE' });
    await supabase('oglasi', { method: 'POST', body: JSON.stringify(normalizedAds) });
    await supabase('daily_import_runs', { method: 'POST', body: JSON.stringify({ run_date: runDate, added_count: normalizedAds.length, deleted_count: Math.min(oldest.length, DELETE_OLDEST), cities: [...new Set(normalizedAds.map(ad => ad.grad))] }) });
    let social = null;
    if (process.env.AUTO_SOCIAL_PUBLISH !== 'false' && process.env.PUBLIC_SITE_URL && (process.env.META_PUBLISH_TOKEN || process.env.IG_TOKEN)) {
      try {
        const publishResponse = await fetch(`${process.env.PUBLIC_SITE_URL}/api/meta-publish`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.META_PUBLISH_TOKEN || process.env.IG_TOKEN}` } });
        social = await publishResponse.json();
      } catch (publishError) { social = { ok: false, error: publishError.message }; }
    }
    return res.status(200).json({ ok: true, added: normalizedAds.length, deleted: Math.min(oldest.length, DELETE_OLDEST), cities: [...new Set(normalizedAds.map(ad => ad.grad))], social });
  } catch (error) { console.error(error); return res.status(500).json({ error: error.message }); }
};
