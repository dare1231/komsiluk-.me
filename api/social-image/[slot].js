// Serves a social collage as a plain, anonymous JPEG from our own domain so Instagram can fetch it.
// URL shape: /api/social-image/pkg-<24 hex>.jpg
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://revfltrlzwmcyqnquvfa.supabase.co';
module.exports = async (req, res) => {
  const raw = String(req.query.slot || '');
  const match = /^(pkg-[a-f0-9]{24})(\.jpe?g)?$/i.exec(raw);
  if (!match || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(404).end('Not found');
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/oglasi-slike/social-collages/${match[1]}.jpg`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) return res.status(404).end('Not found');
    const buffer = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).end(buffer);
  } catch (error) {
    console.error('[social-image]', error);
    return res.status(502).end('Bad gateway');
  }
};
