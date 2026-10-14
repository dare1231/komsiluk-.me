const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const table = 'site_visits';

async function supabase(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.method === 'POST' ? 'return=minimal' : undefined,
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, text };
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(500).json({ error: 'Nisu podešene Supabase server varijable.' });
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const visitorId = String(body.visitorId || '').slice(0, 100);
      if (!visitorId) return res.status(400).json({ error: 'Nedostaje visitorId.' });
      const result = await supabase(table, { method: 'POST', body: JSON.stringify({ visitor_id: visitorId, path: String(body.path || '/').slice(0, 300), referrer: String(body.referrer || '').slice(0, 500) }) });
      if (!result.ok) return res.status(502).json({ error: result.text });
      return res.status(204).end();
    }
    if (req.method === 'GET') {
      const [total, unique, today] = await Promise.all([
        supabase(`${table}?select=id&limit=100000`),
        supabase(`${table}?select=visitor_id&limit=100000`),
        supabase(`${table}?select=id&created_at=gte.${new Date().toISOString().slice(0, 10)}T00:00:00.000Z&limit=100000`)
      ]);
      if (!total.ok || !unique.ok || !today.ok) return res.status(502).json({ error: 'Ne mogu da učitam analitiku.' });
      return res.status(200).json({ visits: total.data.length, uniqueVisitors: new Set(unique.data.map(row => row.visitor_id)).size, today: today.data.length });
    }
    return res.status(405).json({ error: 'Dozvoljeni su GET i POST.' });
  } catch (error) { return res.status(500).json({ error: error.message || 'Greška analitike.' }); }
};
