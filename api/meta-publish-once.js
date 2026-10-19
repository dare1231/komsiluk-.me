// Temporary one-shot social publish trigger for 2026-10-19 12:28 UTC.
// Vercel Cron invokes this route; it forwards to the existing publisher only
// inside the short time window. Later annual Cron matches are safely ignored.
const RUN_AT = Date.parse('2026-10-19T12:28:00Z');
const EXPIRES_AT = Date.parse('2026-10-19T12:31:00Z');

module.exports = async (req, res) => {
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers['x-vercel-cron'] !== '1') {
    return res.status(401).json({ error: 'Neautorizovan Cron poziv.' });
  }

  const now = Date.now();
  if (now < RUN_AT) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'Još nije vrijeme za objavu.' });
  }
  if (now > EXPIRES_AT) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'Prozor jednokratne objave je istekao.' });
  }

  return require('./meta-publish')(req, res);
};
