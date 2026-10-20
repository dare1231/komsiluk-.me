const SUPABASE_URL = process.env.SUPABASE_URL || 'https://revfltrlzwmcyqnquvfa.supabase.co';

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const slot = String(req.query?.slot || '');
  if (!/^pkg-[a-f0-9]{24}$/.test(slot)) return res.status(400).send('Invalid image slot');

  const source = `${SUPABASE_URL}/storage/v1/object/public/oglasi-slike/social-collages/${slot}.jpg`;
  const response = await fetch(source);
  if (!response.ok) return res.status(response.status).send('Image not found');

  const body = Buffer.from(await response.arrayBuffer());
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.status(200).send(body);
};
