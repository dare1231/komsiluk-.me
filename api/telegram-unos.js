// Komšiluk.me — Telegram bot za brzi unos oglasa.
// Admin pošalje botu SLIKU sa tekstom ispod (npr. "Bicikl za dijete, 80€, Budva, 067 123 456")
// i oglas se odmah pojavi u aplikaciji. Bot sluša samo ID-jeve iz TELEGRAM_UNOS_ADMINS.
//
// Vercel varijable:
//   TELEGRAM_UNOS_TOKEN   — token od @BotFather
//   TELEGRAM_UNOS_ADMINS  — tvoj Telegram ID (bot ti ga kaže kad mu prvi put pišeš); više ID-jeva odvojiti zarezom
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — već postoje
//   PUBLIC_SITE_URL       — npr. https://komsiluk.me (opciono)
//   ANTHROPIC_API_KEY     — preporučeno; AI čita sirov tekst (može isti ključ kao za Budva Online)
//   CRON_SECRET           — već postoji; bot njime javlja novi oglas redu za Instagram
// Jednokratno povezivanje: otvori u pregledaču  /api/telegram-unos?setup=1

const crypto = require('crypto');

const GRADOVI = {"Podgorica": ["Blok 5", "Blok 6", "Blok 9", "Tološi", "City Kvart", "Centar", "Zabjelo", "Preko Morače", "Stara Varoš", "Momišići", "Gornja Gorica", "Zlatica", "Konik", "Dabovići", "Donja Gorica"], "Nikšić": ["Kličevo", "Stara Varoš", "Rubeža", "Centar", "Bistrica", "Rastoci", "Željezara", "Dragova Luka", "Kočani", "Straševina", "Vidovanjski", "Grebice"], "Bar": ["Topolica", "Bjeliši", "Šušanj", "Biskupada", "Centar", "Polje", "Rutke", "Zeleni Pojas", "Ilino", "Rena", "Burtaši", "Sutomorska obala"], "Budva": ["Centar", "Rozino", "Dubovica", "Bečići", "Petrovac", "Rafailovići", "Jaz", "Babin Do", "Prijevor", "Sveti Stefan", "Pržno"], "Kotor": ["Stari Grad", "Dobrota", "Škaljari", "Prčanj", "Perast", "Risan", "Muo", "Kavč", "Ljuta", "Stoliv"], "Herceg Novi": ["Stari Grad", "Igalo", "Topla", "Savina", "Meljine", "Zelenika", "Baošići", "Đenovići", "Kamenari", "Sutorina"], "Tivat": ["Centar", "Kalimanj", "Donja Lastva", "Gornja Lastva", "Seljanovo", "Mazina", "Mrčevac", "Lepetani", "Radovići"], "Ulcinj": ["Stari Grad", "Pinješ", "Metering", "Bjelisi", "Dobre Vode", "Donji Štoj", "Gornji Štoj", "Velika Plaža", "Krue", "Kod Zgrade"], "Cetinje": ["Stari Grad", "Donje Polje", "Bogorodičina", "Vlaška Crkva", "Gornje Polje", "Cetinjsko Polje", "Bajice"], "Bijelo Polje": ["Nikoljac", "Centar", "Pruška", "Loznice", "Nedakusi", "Rasovo", "Lipnica", "Ribarevine"], "Berane": ["Centar", "Livadice", "Donji Talum", "Rudeš", "Dolac", "Hareme", "Buče", "Pešca"], "Pljevlja": ["Centar", "Gagovića Imanje", "Moćevac", "Guka", "Varoš", "Ševari", "Zlatiborci", "Židovići"], "Rožaje": ["Centar", "Bandžovo Brdo", "Bujici", "Kaludra", "Besnik", "Grahovača"], "Kolašin": ["Centar", "Breza", "Bjelasica", "Selišta", "Bare", "Mateševo"], "Žabljak": ["Centar", "Bosača", "Njegovići", "Tepca", "Motički Gaj"], "Mojkovac": ["Centar", "Uloševina", "Podbišće", "Ambar", "Bojišta"], "Plav": ["Centar", "Hajdaroviće", "Prnjavor", "Meteor", "Brezujevići"], "Andrijevica": ["Centar", "Prisoja", "Kralje", "Trešnjevik"], "Danilovgrad": ["Centar", "Grlić", "Slap", "Landža", "Spuž", "Jelenak"], "Tuzi": ["Centar", "Vranj", "Kušanje", "Milješ", "Sukuruć", "Dinoša"], "Gusinje": ["Centar", "Vusanje", "Ali Pašini Izvori", "Martinovići"], "Petnjica": ["Centar", "Krnja Jela", "Vrbica", "Lozna", "Trpezi"], "Šavnik": ["Centar", "Komore", "Bukovica", "Petnjica"], "Plužine": ["Centar", "Goransko", "Brezorna", "Trsa", "Stabna"]};
const NEUTRAL = '/assets/neutral-product.svg';
const BUCKET = 'oglasi-slike';

const tgToken = () => String(process.env.TELEGRAM_UNOS_TOKEN || '').trim();
const secret = () => crypto.createHash('sha256').update('komsiluk-unos:' + tgToken()).digest('hex').slice(0, 48);
const admins = () => String(process.env.TELEGRAM_UNOS_ADMINS || '').split(/[\s,;]+/).filter(Boolean);
const site = () => String(process.env.PUBLIC_SITE_URL || 'https://komsiluk.me').replace(/\/+$/, '');
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'dj');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${tgToken()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram ${r.status}`);
  return j.result;
}
const reply = (chat, text) => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});

async function sb(path, opts = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(`${process.env.SUPABASE_URL}${path}`, { ...opts, headers: { apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers || {}) } });
  const t = await r.text(); let d; try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) throw new Error((d && (d.message || d.error || d.hint)) || t || `Supabase ${r.status}`);
  return d;
}

// ---------- izvlačenje podataka iz teksta ----------
// korijen imena grada da se poklope padeži: Budva/Budvi/Budve, Nikšić/Nikšiću, Kotor/Kotoru
const korijen = g => { const k = fold(g).replace(/[^a-z0-9 ]+/g, ' ').trim(); return k.length >= 4 && !/ /.test(k) ? k.replace(/[aeiou]$/, '').slice(0, Math.max(4, k.length - 1)) : k; };
function gradRegex(g) {
  const k = korijen(g).split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const suf = k.length <= 3 ? '(?:u|a)?' : '[a-z]{0,3}';
  return new RegExp(`(^|[^a-z0-9])(?:(?:u|iz|na|za|kod)\\s+)?${k}${suf}(?=$|[^a-z0-9])`, 'g');
}
function nadjiGrad(text) {
  const f = fold(text);
  let best = null;
  for (const g of Object.keys(GRADOVI)) if (gradRegex(g).test(f) && (!best || g.length > best.length)) best = g;
  if (!best) return null;
  let kvart = 'Centar';
  for (const kv of GRADOVI[best]) if (kv !== 'Centar' && f.includes(fold(kv))) { kvart = kv; break; }
  return { grad: best, kvart };
}

function nadjiTelefon(text) {
  const m = text.match(/(?:\+|00)?382[\s/.-]*\(?0?\)?\s*(6\d)[\s/.-]*(\d{3})[\s/.-]*(\d{3,4})|\b0(6\d)[\s/.-]*(\d{3})[\s/.-]*(\d{3,4})\b/);
  if (!m) return null;
  const [a, b, c] = m[1] ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
  return { tekst: m[0], broj: `0${a} ${b} ${c}` };
}

function nadjiCijenu(text) {
  if (/\b(besplatno|poklanjam|gratis|džabe|dzabe)\b/i.test(text)) return { tekst: '', cena: 'Besplatno' };
  const m = text.match(/(?:cijena|cena)?\s*:?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(€|eur(?:a|o)?\b|evra\b|e\b|k\b)/i)
    || text.match(/(?:cijena|cena)\s*:?\s*(\d+(?:[.,]\d{1,2})?)/i)
    || text.match(/€\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return /\b(po dogovoru|dogovor)\b/i.test(text) ? { tekst: '', cena: 'Po dogovoru' } : null;
  let n = m[1].replace(/\.(?=\d{3}\b)/g, '');
  if (m[2] && /^k$/i.test(m[2])) n = String(Number(n.replace(',', '.')) * 1000);
  return { tekst: m[0], cena: `${n}€` };
}

function osnovniNaziv(text, ukloni, grad, kvart) {
  // radimo na verziji bez kvačica za pronalaženje, a sječemo original na istim pozicijama
  let t = text;
  for (const u of ukloni) if (u) t = t.split(u).join(' ');
  const cut = re => { const f = fold(t); let out = '', last = 0, m; re.lastIndex = 0; while ((m = re.exec(f))) { out += t.slice(last, m.index + (m[1] || '').length) + ' '; last = m.index + m[0].length; if (!re.global) break; } t = out + t.slice(last); };
  if (grad) cut(gradRegex(grad));
  if (kvart && kvart !== 'Centar') cut(new RegExp(`(^|[^a-z0-9])(?:(?:u|na|iz)\\s+)?${fold(kvart).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'));
  t = t.replace(/\b(prodajem|prodaje se|na prodaju|hitno|po dogovoru|dogovor|poklanjam|besplatno|gratis|tel(?:efon)?|kontakt|cijena|cena|grad|lokacija)\b\s*:?/gi, ' ');
  const dijelovi = t.split(/\n|[.;!?](?:\s|$)|,\s/).map(x => x.replace(/^[\s,;:\-–|·+]+|[\s,;:\-–|·+]+$/g, '').replace(/\s{2,}/g, ' ').trim());
  const n = dijelovi.find(x => x.length >= 3 && /[a-zčćšžđ]/i.test(x)) || '';
  return n ? (/^[a-zčćšžđ][a-zčćšžđ]/.test(n) ? n.charAt(0).toUpperCase() + n.slice(1, 80) : n.slice(0, 80)) : '';
}

// AI čita sirov tekst (prepisan oglas, proslijeđena poruka, opis sa sajta...) i vraća čista polja.
async function aiIzvuci(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 200,
        messages: [{ role: 'user', content: `Ovo je sirov tekst malog oglasa iz Crne Gore. Vrati SAMO JSON bez objašnjenja:
{"naziv": "kratak naslov proizvoda na crnogorskom, 2-7 riječi, bez cijene, grada i telefona",
 "cena": "npr. 80€ ili Po dogovoru ili Besplatno",
 "grad": "jedan od: ${Object.keys(GRADOVI).join(', ')} — ili null ako nije naveden",
 "kvart": "kvart/naselje ako je navedeno, inače null",
 "telefon": "broj telefona ako postoji, inače null"}
Ne izmišljaj podatke koji nisu u tekstu.

Tekst:
${text.slice(0, 3000)}` }]
      })
    });
    const j = await r.json();
    const t = j && j.content && j.content[0] && j.content[0].text || '';
    const m = t.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

async function izvuci(text) {
  const lok = nadjiGrad(text), tel = nadjiTelefon(text), cij = nadjiCijenu(text);
  const out = {
    naziv: osnovniNaziv(text, [tel && tel.tekst, cij && cij.tekst], lok && lok.grad, lok && lok.kvart),
    grad: lok && lok.grad, kvart: lok ? lok.kvart : 'Centar',
    cena: cij ? cij.cena : 'Po dogovoru', telefon: tel ? tel.broj : 'Chat'
  };
  const ai = await aiIzvuci(text);
  if (ai) {
    if (ai.naziv && String(ai.naziv).trim().length >= 3) out.naziv = String(ai.naziv).trim().replace(/^["'„“]+|["'“”]+$/g, '').slice(0, 80);
    // grad i telefon prihvatamo od AI samo ako postoje u tekstu (da ne izmisli)
    if (!out.grad && ai.grad && GRADOVI[ai.grad] && gradRegex(ai.grad).test(fold(text))) out.grad = ai.grad;
    if (out.grad && ai.kvart && (GRADOVI[out.grad] || []).some(k => fold(k) === fold(ai.kvart))) out.kvart = GRADOVI[out.grad].find(k => fold(k) === fold(ai.kvart));
    if (!cij && ai.cena && /\d|dogovor|besplatno/i.test(ai.cena)) out.cena = String(ai.cena).replace(/\s*(eur|eura|evra|e)\.?$/i, '€').slice(0, 20);
    if (!tel && ai.telefon) { const t2 = nadjiTelefon(String(ai.telefon)); if (t2 && text.replace(/\D/g, '').includes(t2.broj.replace(/\D/g, '').slice(1))) out.telefon = t2.broj; }
  }
  return out;
}

// Javi redu za Instagram/Facebook: na svaka 3 nova oglasa ide jedna objava (3 oglasa + 1 Temu).
async function javiMeta(host, id) {
  const secret = process.env.CRON_SECRET || process.env.META_PUBLISH_TOKEN;
  try {
    const r = await fetch(`https://${host}/api/meta-publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(secret ? { new_ad_ids: [id] } : { ping: true })
    });
    const j = await r.json().catch(() => ({}));
    if (j.published) return '📸 Instagram/Facebook: objavljen paket (3 oglasa + Temu) ✓';
    if (j.pending_ads != null) return `📸 Instagram: u redu ${j.pending_ads}/3 — objava ide kad se skupe 3 nova oglasa.`;
    if (j.error) return '📸 Instagram: ' + j.error;
    return '';
  } catch (e) { return ''; }
}

// ---------- slika ----------
async function sacuvajSliku(photos) {
  const best = photos.slice().sort((a, b) => (b.file_size || b.width * b.height) - (a.file_size || a.width * a.height))[0];
  const file = await tg('getFile', { file_id: best.file_id });
  const r = await fetch(`https://api.telegram.org/file/bot${tgToken()}/${file.file_path}`);
  if (!r.ok) throw new Error('Ne mogu preuzeti sliku sa Telegrama.');
  const buf = Buffer.from(await r.arrayBuffer());
  const path = `telegram/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  await sb(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false', 'cache-control': '3600' }, body: buf });
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

const POMOC = [
  '👋 <b>Komšiluk unos</b>',
  '',
  'Pošalji mi <b>sliku</b> i ispod nje zalijepi oglas kakav god da je (može i prepisan, proslijeđen), npr:',
  '<i>Bicikl za dijete, 80€, Budva, 067 123 456</i>',
  '',
  'Ja izvučem naziv, cijenu, grad i telefon i objavim oglas na Komšiluk.me.',
  'Bez cijene piše „Po dogovoru“, bez telefona kupci pišu preko četa.',
  'Grad je obavezan.',
  '',
  'Na svaka 3 nova oglasa (od bilo koga) ide objava na Instagram i Facebook: 3 oglasa + 1 Temu.',
  'Pogrešan oglas obrišeš komandom koju ti pošaljem uz potvrdu.'
].join('\n');

async function obradi(msg, host) {
  const chat = msg.chat.id, from = String(msg.from && msg.from.id || '');
  const list = admins();
  if (!list.includes(from)) {
    return reply(chat, list.length
      ? '⛔ Ovaj bot je privatan.'
      : `Tvoj Telegram ID je <code>${esc(from)}</code>.\nUpiši ga u Vercel kao <b>TELEGRAM_UNOS_ADMINS</b> (projekat komsiluk.me), pa Redeploy.`);
  }
  const text = String(msg.caption || msg.text || '').trim();

  if (/^\/(start|pomoc|help)\b/i.test(text)) return reply(chat, POMOC);

  const del = text.match(/^\/obrisi_(\d+)\b/i);
  if (del) {
    const rows = await sb(`/rest/v1/oglasi?id=eq.${del[1]}&izvorni_link=like.telegram:*`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
    return reply(chat, rows && rows.length ? `🗑 Obrisan oglas: ${esc(rows[0].naziv)}` : 'Taj oglas nije nađen (ili nije objavljen preko bota).');
  }

  if (!text) return reply(chat, msg.photo ? '📝 Fali tekst. Pošalji sliku ponovo i ispod nje napiši oglas (naziv, cijena, grad, telefon).' : POMOC);

  const dup = await sb(`/rest/v1/oglasi?select=id&izvorni_link=eq.telegram:${msg.message_id}&limit=1`).catch(() => []);
  if (dup && dup.length) return;   // Telegram ponovio istu poruku — oglas već postoji

  const o = await izvuci(text);
  if (!o.grad) return reply(chat, '📍 Ne vidim grad. Pošalji ponovo i dodaj grad, npr. „Budva“ ili „Podgorica“.');
  if (!o.naziv || o.naziv.length < 3) return reply(chat, '🏷 Ne vidim šta se prodaje. Pošalji ponovo sa nazivom na početku, npr. „Bicikl za dijete, 80€, Budva“.');

  await tg('sendChatAction', { chat_id: chat, action: msg.photo ? 'upload_photo' : 'typing' }).catch(() => {});
  const img = msg.photo && msg.photo.length ? await sacuvajSliku(msg.photo) : NEUTRAL;

  const red = {
    grad: o.grad, kvart: o.kvart, dist_km: 0.2, naziv: o.naziv, cena: o.cena, telefon: o.telefon, img,
    top: `${30 + Math.floor(Math.random() * 30)}%`, left: `${30 + Math.floor(Math.random() * 30)}%`,
    odobreno: true, izvorni_link: `telegram:${msg.message_id}`, user_id: null
  };
  const rows = await sb('/rest/v1/oglasi', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify([red]) });
  const id = rows && rows[0] && rows[0].id;

  await reply(chat, [
    '✅ <b>Objavljeno na Komšiluk.me</b>',
    '',
    `🏷 ${esc(o.naziv)}`,
    `💶 ${esc(o.cena)}`,
    `📍 ${esc(o.grad)}${o.kvart && o.kvart !== 'Centar' ? ', ' + esc(o.kvart) : ''}`,
    `📞 ${esc(o.telefon === 'Chat' ? 'preko četa' : o.telefon)}`,
    msg.photo ? '' : '🖼 bez slike (stavljena neutralna)',
    '',
    id ? `🔗 ${site()}/?oglas=${id}` : '',
    id ? `Pogrešno? Pošalji /obrisi_${id}` : ''
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i < a.length - 1)).join('\n'));
  // Instagram red ide poslije potvrde, da ne čekaš na kolaž
  const meta = id ? await javiMeta(host, id) : '';
  if (meta) await reply(chat, meta);
}

module.exports = async function handler(req, res) {
  if (!tgToken()) return res.status(200).json({ ok: false, error: 'TELEGRAM_UNOS_TOKEN nije podešen u Vercelu.' });

  if (req.method === 'GET') {
    if (String((req.query && req.query.setup) || '') !== '1') return res.status(200).json({ ok: true, bot: 'komsiluk-unos' });
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `https://${host}/api/telegram-unos`;
    try {
      await tg('setWebhook', { url, secret_token: secret(), allowed_updates: ['message'], drop_pending_updates: true });
      const me = await tg('getMe', {});
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`<meta name="viewport" content="width=device-width"><body style="font:18px system-ui;padding:24px">✅ Bot <b>@${esc(me.username)}</b> je povezan sa Komšilukom.<br><br>Otvori ga u Telegramu i pošalji <b>/start</b>.</body>`);
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret()) return res.status(401).end();

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const msg = body.message;
  if (msg && msg.chat) {
    try { await obradi(msg, req.headers['x-forwarded-host'] || req.headers.host); }
    catch (e) { await reply(msg.chat.id, '❌ Nije objavljeno: ' + esc(e.message)); }
  }
  return res.status(200).json({ ok: true });
};

module.exports.izvuci = izvuci;
