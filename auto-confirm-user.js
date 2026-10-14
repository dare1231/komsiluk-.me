const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Samo POST.' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Na Vercelu nisu podešene SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.' });
  }
  try {
    const { userId } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!userId) return res.status(400).json({ error: 'Nedostaje userId.' });
    const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email_confirm: true })
    });
    if (!response.ok) return res.status(502).json({ error: `Supabase Admin API greška: ${await response.text()}` });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Greška servera.' });
  }
};
