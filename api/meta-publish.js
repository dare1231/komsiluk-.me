const sharp = require('sharp');
const crypto = require('crypto');
const GRAPH = 'https://graph.facebook.com/v21.0';
const IG_GRAPH = 'https://graph.instagram.com/v26.0';
const CAPTION = 'Najnovije na aplikaciji · link u bio';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://revfltrlzwmcyqnquvfa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJldmZsdHJsendtY3lxbnF1dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MDUwNDYsImV4cCI6MjEwNDM4MTA0Nn0.f0xKPTOaeecm3OFNtO3qfdduDHf-FvV47phgUExS5wI';
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || '';
const PAGE_ID = process.env.FB_PAGE_ID || process.env.META_PAGE_ID || '';
const IG_PUBLISH_TOKEN = process.env.IG_ACCESS_TOKEN || process.env.IG_TOKEN || '';
const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || IG_PUBLISH_TOKEN;
const IG_USER_ID = process.env.IG_USER_ID || process.env.META_IG_USER_ID || process.env.IG_ID;
const PUBLISH_TOKEN = process.env.META_PUBLISH_TOKEN || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const COLLAGE_FONT = 'DejaVu Sans';
let resolvedPageToken = null;
let resolvedInstagramUserId = null;
async function isSupabaseUserToken(token) {
  if (!token) return false;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  return response.ok;
}
async function getPageToken() {
  if (resolvedPageToken) return resolvedPageToken;
  const directPageToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN;
  if (directPageToken) return (resolvedPageToken = directPageToken);
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
async function getInstagramUserId() {
  if (resolvedInstagramUserId) return resolvedInstagramUserId;
  const token = await getPageToken();
  const r = await fetch(`${GRAPH}/${PAGE_ID}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = data.error || {};
    const details = [error.type, error.code != null && `code=${error.code}`, error.error_subcode != null && `subcode=${error.error_subcode}`, error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`].filter(Boolean).join(', ');
    throw new Error(`${error.message || `Meta Page lookup ${r.status}`} [/PAGE_ID?fields=instagram_business_account${details ? `; ${details}` : ''}]`);
  }
  const linkedId = data.instagram_business_account?.id;
  if (!linkedId) throw new Error(`Facebook Page ${PAGE_ID} nema povezan Instagram Professional nalog.`);
  resolvedInstagramUserId = String(linkedId);
  return resolvedInstagramUserId;
}
async function getInstagramLoginUserId(token) {
  const r = await fetch(`${IG_GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = data.error || {};
    const details = [error.type, error.code != null && `code=${error.code}`, error.error_subcode != null && `subcode=${error.error_subcode}`, error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`].filter(Boolean).join(', ');
    throw new Error(`${error.message || `Instagram Login lookup ${r.status}`} [/me?fields=user_id,username${details ? `; ${details}` : ''}]`);
  }
  const id = data.user_id || data.id;
  if (!id) throw new Error('Instagram Login token nije vratio Instagram user_id.');
  return String(id);
}
const publicImage = img => img && img.startsWith('http') ? img : `${PUBLIC_SITE_URL}${img || '/assets/neutral-product.svg'}`;
async function supabase(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) } });
  const text = await r.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.message || text || `Supabase ${r.status}`); return data;
}
async function graph(path, body, accessToken = '') {
  const token = accessToken || await getPageToken();
  const r = await fetch(`${GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, access_token: token }) });
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = data.error || {};
    const details = [error.type, error.code != null && `code=${error.code}`, error.error_subcode != null && `subcode=${error.error_subcode}`, error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`].filter(Boolean).join(', ');
    throw new Error(`${error.message || `Meta Graph API ${r.status}`} [${path}${details ? `; ${details}` : ''}]`);
  }
  return data;
}
async function instagramGraph(path, body, accessToken) {
  const r = await fetch(`${IG_GRAPH}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, access_token: accessToken }) });
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = data.error || {};
    const details = [error.type, error.code != null && `code=${error.code}`, error.error_subcode != null && `subcode=${error.error_subcode}`, error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`].filter(Boolean).join(', ');
    throw new Error(`${error.message || `Instagram Graph API ${r.status}`} [${path}${details ? `; ${details}` : ''}]`);
  }
  return data;
}
async function graphPhoto(pageId, buffer, caption) {
  const form = new FormData();
  form.append('source', new Blob([buffer], { type: 'image/jpeg' }), 'komsiluk.jpg');
  form.append('caption', caption);
  form.append('published', 'true');
  form.append('access_token', await getPageToken());
  const r = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: form });
  const data = await r.json();
  if (!r.ok || data.error) {
    const error = data.error || {};
    const details = [error.type, error.code != null && `code=${error.code}`, error.error_subcode != null && `subcode=${error.error_subcode}`, error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`].filter(Boolean).join(', ');
    throw new Error(`${error.message || `Meta Graph API ${r.status}`} [/photos${details ? `; ${details}` : ''}]`);
  }
  return data;
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
  const labels = items.map((o, i) => { const x = (i % 2) * 540 + 24, y = Math.floor(i / 2) * 390 + startY; return `<text x="${x}" y="${y + 332}" fill="#0f172a" font-family="${COLLAGE_FONT}" font-size="24" font-weight="700">${esc(String(o.naziv || o.name).slice(0, 34))}</text><text x="${x}" y="${y + 360}" fill="#475569" font-family="${COLLAGE_FONT}" font-size="19">${esc(String(o.mjesto || '').slice(0, 44))}</text>`; }).join('');
  const header = Buffer.from(`<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1080" height="1080" fill="#f8fafc"/><rect width="1080" height="155" fill="#0f766e"/><text x="54" y="70" fill="white" font-family="${COLLAGE_FONT}" font-size="39" font-weight="700">Najnovije na aplikaciji</text><text x="54" y="119" fill="#d1fae5" font-family="${COLLAGE_FONT}" font-size="25">4 proizvoda · link u bio</text>${labels}</svg>`);
  return sharp({ create: { width: 1080, height: 1080, channels: 4, background: '#f8fafc' } }).composite([{ input: header }, ...layers]).jpeg({ quality: 90 }).toBuffer();
}
async function upload(buffer, slot) {
  const path = `social-collages/${slot}.jpg`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/oglasi-slike/${path}`, { method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: buffer });
  if (!r.ok) throw new Error(`Ne mogu sačuvati kolaž (${r.status}).`);
  const signed = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/oglasi-slike/${path}`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const signedData = await signed.json();
  if (!signed.ok || !signedData.signedURL) throw new Error(`Ne mogu napraviti signed URL za kolaž (${signed.status}).`);
  // Meta receives a time-limited direct JPEG URL, without Vercel or bucket auth.
  // Supabase returns a path relative to /storage/v1 (e.g. /object/sign/bucket/file.jpg?token=...).
  // Without the /storage/v1 prefix the URL returns a JSON 404 and Instagram rejects it (code 9004 / 2207052).
  const signedPath = signedData.signedURL;
  let signedUrl;
  if (signedPath.startsWith('http')) signedUrl = signedPath;
  else {
    const withPrefix = signedPath.startsWith('/storage/v1') ? signedPath : `/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
    signedUrl = `${SUPABASE_URL}${withPrefix}`;
  }
  // Verify what Instagram will actually fetch: it must be a direct, anonymous JPEG response.
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/oglasi-slike/${path}`;
  // Preferred: our own domain (clean .jpg URL, no query token), which Instagram fetches reliably.
  const siteUrl = `${PUBLIC_SITE_URL.replace(/\/+$/, '')}/api/social-image/${slot}.jpg`;
  const problems = [];
  for (const [label, candidate] of [['site', siteUrl], ['signed', signedUrl], ['public', publicUrl]]) {
    try {
      const check = await fetch(candidate, { redirect: 'follow' });
      const type = check.headers.get('content-type') || '';
      if (check.ok && /^image\/jpe?g/i.test(type)) { await check.arrayBuffer().catch(() => {}); return candidate; }
      problems.push(`${label}: HTTP ${check.status}, ${type || 'bez content-type'}`);
    } catch (error) { problems.push(`${label}: ${error.message}`); }
  }
  throw new Error(`Kolaž nije javno dostupan kao JPEG za Instagram (${problems.join(' | ')}). Provjeri PUBLIC_SITE_URL u Vercelu i da li je bucket oglasi-slike Public.`);
}
function packageKey(local, temu) {
  const signature = `${local.map(o => o.id).join(',')}|${temu.id || 0}`;
  return `pkg-${crypto.createHash('sha256').update(signature).digest('hex').slice(0, 24)}`;
}
function isDuplicateError(error) { return /duplicate key|unique constraint|23505/i.test(String(error?.message || error)); }
module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const bySecret = Boolean(PUBLISH_TOKEN && authorization === `Bearer ${PUBLISH_TOKEN}`);
  const byCron = Boolean(CRON_SECRET && authorization === `Bearer ${CRON_SECRET}`);
  const byLoggedInAdmin = !bySecret && !byCron && await isSupabaseUserToken(bearer);
  if (!bySecret && !byCron && !byLoggedInAdmin) return res.status(401).json({ error: 'Neautorizovan publish.' });
  if (!PAGE_ID || !PAGE_ACCESS_TOKEN || !PUBLIC_SITE_URL) return res.status(500).json({ error: 'Meta i PUBLIC_SITE_URL varijable nijesu podešene.' });
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const manual = payload.manual === true;
    if (process.env.AUTO_SOCIAL_PUBLISH === 'false' && !manual) return res.status(200).json({ ok: true, skipped: true, message: 'Automatska objava je isključena.' });
    let runs = [];
    try { runs = await supabase('social_publish_runs?select=oglas_id,slot_key,facebook_post_id,instagram_media_id&limit=10000'); }
    catch (error) {
      if (String(error.message).includes('social_publish_runs')) return res.status(500).json({ error: 'Nedostaje tabela social_publish_runs; pokreni temu-products.sql u Supabase-u.' });
      throw error;
    }
    const knownIds = new Set(runs.map(row => String(row.oglas_id)));
    let temuRows = [];
    try { temuRows = await supabase('temu_products?select=*&active=eq.true&order=last_published_at.asc.nullsfirst,created_at.asc&limit=1'); }
    catch (error) { if (!String(error.message).includes('temu_products')) throw error; }
    const fallback = [
      { naziv: 'Električna kutija za ručak za automobil', cijena: '21,28 €', image_url: 'https://img.kwcdn.com/product/open/dc454ffbfdc844f1ba1eeab73f9f361e-goods.jpeg', affiliate_url: 'https://www.temu.com/me-en/car-specific-electric-lunch-box-compatible-with--12v-car-power-outlets-uses--temperature-heating-technology-can-quickly-heat-food-and-keep-meals-warm-non-food-contact-g-606289727985146.html?top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Fopen%2Fdc454ffbfdc844f1ba1eeab73f9f361e-goods.jpeg' },
      { naziv: 'Radio za vanredne situacije', cijena: '42,17 €', image_url: 'https://img.kwcdn.com/product/fancy/5ac9a871-a7de-4d15-9604-9c5e28626d4d.jpg', affiliate_url: 'https://www.temu.com/me-en/10000mah-37000-mwh-emergency-weather-radio-solar-hand-crank-portable-radio-with-am-fm--battery-operated-3-mode-flashlight-reading-lamp-sos-alarm-phone-charger-for-indoor-outdoor-emergency-g-601104593278176.html?top_gallery_url=https%3A%2F%2Fimg.kwcdn.com%2Fproduct%2Ffancy%2F5ac9a871-a7de-4d15-9604-9c5e28626d4d.jpg' }
    ];
    const defaultTemu = temuRows[0] || fallback[new Date().getUTCDate() % fallback.length];
    let requestedIds = Array.isArray(payload.new_ad_ids) ? [...new Set(payload.new_ad_ids.map(Number).filter(id => Number.isSafeInteger(id) && id > 0))] : [];
    if (!requestedIds.length && manual) {
      const recent = await supabase('oglasi?select=id&odobreno=eq.true&order=created_at.desc&limit=3');
      requestedIds = recent.map(row => Number(row.id));
      const partial = runs.filter(row => requestedIds.includes(Number(row.oglas_id)) && row.facebook_post_id && !row.instagram_media_id && row.slot_key !== 'queue');
      for (const row of partial) {
        await supabase(`social_publish_runs?slot_key=eq.${encodeURIComponent(row.slot_key)}&oglas_id=eq.${row.oglas_id}`, { method: 'PATCH', body: JSON.stringify({ slot_key: 'queue' }) });
      }
    }
    if (requestedIds.length) {
      const approved = await supabase(`oglasi?select=id&odobreno=eq.true&id=in.(${requestedIds.join(',')})`);
      const toQueue = approved.filter(row => !knownIds.has(String(row.id)));
      for (const row of toQueue) {
        try {
          await supabase('social_publish_runs', { method: 'POST', body: JSON.stringify({ slot_key: 'queue', oglas_id: row.id, temu_product_id: defaultTemu.id || 0, facebook_post_id: null, instagram_media_id: null, caption: CAPTION }) });
          knownIds.add(String(row.id));
        } catch (error) {
          if (!isDuplicateError(error)) throw error;
        }
      }
    }
    const queued = await supabase('social_publish_runs?select=oglas_id,temu_product_id,facebook_post_id,instagram_media_id&slot_key=eq.queue&order=created_at.asc&limit=3');
    if (queued.length < 3) return res.status(200).json({ ok: true, skipped: true, pending_ads: queued.length, required_ads: 3, message: `Čeka se još ${3 - queued.length} odobrena lokalna oglasa za paket.` });
    const ids = queued.map(row => Number(row.oglas_id));
    const ads = await supabase(`oglasi?select=*&odobreno=eq.true&id=in.(${ids.join(',')})`);
    const adsById = new Map(ads.map(row => [String(row.id), row]));
    const local = ids.map(id => adsById.get(String(id))).filter(Boolean);
    if (local.length < 3) {
      const invalidIds = ids.filter(id => !adsById.has(String(id)));
      if (invalidIds.length) await supabase(`social_publish_runs?slot_key=eq.queue&oglas_id=in.(${invalidIds.join(',')})`, { method: 'DELETE' });
      return res.status(200).json({ ok: true, skipped: true, message: 'Paket čeka tri važeća odobrena oglasa.' });
    }
    const temuId = Number(queued[0].temu_product_id || 0);
    let temu = defaultTemu;
    if (temuId > 0) {
      const productRows = await supabase(`temu_products?select=*&id=eq.${temuId}&limit=1`);
      if (productRows.length) temu = productRows[0];
    }
    const slot = packageKey(local, temu);
    const collage = await makeCollage(local, temu, slot);
    const imageUrl = await upload(collage, slot);
    const claimed = await supabase(`social_publish_runs?slot_key=eq.queue&oglas_id=in.(${ids.join(',')})`, { method: 'PATCH', body: JSON.stringify({ slot_key: slot }) });
    if (claimed.length < 3) return res.status(200).json({ ok: true, skipped: true, message: 'Ovaj paket već obrađuje drugi zahtjev.' });
    let fb = null, ig = null;
    try {
      const existingFacebookId = queued.map(row => row.facebook_post_id).find(Boolean);
      fb = existingFacebookId ? { id: existingFacebookId } : await graphPhoto(PAGE_ID, collage, CAPTION);
      await supabase(`social_publish_runs?slot_key=eq.${encodeURIComponent(slot)}`, { method: 'PATCH', body: JSON.stringify({ facebook_post_id: fb.id || null }) });
      // Instagram Login does not require the account to be linked to the Facebook Page.
      if (IG_PUBLISH_TOKEN) {
        const instagramUserId = await getInstagramLoginUserId(IG_PUBLISH_TOKEN);
        const media = await instagramGraph(`/${instagramUserId}/media`, { image_url: imageUrl, caption: CAPTION }, IG_PUBLISH_TOKEN);
        await new Promise(resolve => setTimeout(resolve, 3000));
        ig = await instagramGraph(`/${instagramUserId}/media_publish`, { creation_id: media.id }, IG_PUBLISH_TOKEN);
      } else {
        const instagramToken = await getPageToken();
        const instagramUserId = await getInstagramUserId();
        const media = await graph(`/${instagramUserId}/media`, { image_url: imageUrl, caption: CAPTION }, instagramToken);
        ig = await graph(`/${instagramUserId}/media_publish`, { creation_id: media.id }, instagramToken);
      }
      await supabase(`social_publish_runs?slot_key=eq.${encodeURIComponent(slot)}`, { method: 'PATCH', body: JSON.stringify({ instagram_media_id: ig.id || null }) });
    } catch (error) {
      if (!fb) {
        try { await supabase(`social_publish_runs?slot_key=eq.${encodeURIComponent(slot)}`, { method: 'PATCH', body: JSON.stringify({ slot_key: 'queue' }) }); }
        catch (releaseError) { console.error('[Meta queue release]', releaseError); }
        throw error;
      }
      return res.status(502).json({ ok: false, partial: true, facebook_published: true, instagram_published: Boolean(ig), error: error.message, slot });
    }
    if (temu.id) {
      try { await supabase(`temu_products?id=eq.${temu.id}`, { method: 'PATCH', body: JSON.stringify({ last_published_at: new Date().toISOString() }) }); }
      catch (error) { console.error('[Temu publish timestamp]', error); }
    }
    return res.status(200).json({ ok: true, published: true, slot, local_ads: local.map(o => o.id), temu_product: temu.naziv, facebook: fb.id, instagram: ig.id, log_saved: true });
  } catch (error) { console.error(error); return res.status(500).json({ error: error.message }); }
};
