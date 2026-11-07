const axios = require('axios');
const admin = require('firebase-admin');
const db = admin.firestore();
const BOTS = (process.env.TG_BOTS || '').split(',').filter(Boolean);
let rrIndex = 0;

function nextBot() { rrIndex = (rrIndex + 1) % BOTS.length; return BOTS[rrIndex]; }

function extractSong(msg) {
  if (!msg || !msg.document) return null;
  const doc = msg.document;
  const mime = doc.mime_type || '';
  if (!mime.startsWith('audio/') && !doc.file_name?.toLowerCase().endsWith('.mp3')) return null;
  const title = doc.file_name?.replace(/\.[^.]+$/, '') || msg.caption || 'Untitled';
  const parts = title.split(/ - |–|—/);
  return { tg_id: String(msg.message_id), title: (parts[0] || title).trim(), artist: (parts[1] || 'Unknown').trim(), file_id: doc.file_id, size_bytes: doc.file_size || 0, duration: doc.duration || msg.audio?.duration || 0, thumb_file_id: doc.thumbnail?.file_id || null, mime, added_at: admin.firestore.FieldValue.serverTimestamp() };
}

async function handleWebhook(req, res) {
  const msg = req.body.channel_post || req.body.message;
  if (!msg) return res.json({ ok: true });
  const song = extractSong(msg);
  if (song) await db.collection('songs').doc(song.tg_id).set(song, { merge: true });
  res.json({ ok: true });
}

async function syncChannel() {
  const token = nextBot();
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, { params: { allowed_updates: JSON.stringify(['channel_post']), limit: 100 } });
    if (!data.ok) throw new Error(data.description);
    const batch = db.batch();
    for (const u of data.result || []) { const s = extractSong(u.channel_post); if (s) batch.set(db.collection('songs').doc(s.tg_id), s, { merge: true }); }
    await batch.commit();
  } catch (e) {}
}

async function listSongs({ limit = 50 } = {}) {
  const snap = await db.collection('songs').orderBy('added_at', 'desc').limit(+limit).get();
  return { songs: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
}

async function search(q) {
  if (!q) return { songs: [] };
  const snap = await db.collection('songs').limit(500).get();
  return { songs: snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => (s.title + ' ' + s.artist).toLowerCase().includes(q.toLowerCase())).slice(0, 30) };
}

async function streamAudio(req, res) {
  const fileId = req.query.file_id;
  if (!fileId) return res.status(400).json({ error: 'file_id required' });
  const token = nextBot();
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    const stream = await axios.get(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    stream.data.pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

module.exports = { listSongs, search, streamAudio, handleWebhook, syncChannel };
