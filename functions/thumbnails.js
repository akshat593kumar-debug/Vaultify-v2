const axios = require('axios');
const admin = require('firebase-admin');
const db = admin.firestore();
const BOTS = (process.env.TG_BOTS || '').split(',').filter(Boolean);
let botIdx = 0;
async function freshThumb(file_id) {
  if (!file_id) return { url: null };
  const token = BOTS[botIdx++ % BOTS.length];
  try { const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id } }); return { url: `https://api.telegram.org/file/bot${token}/${data.result.file_path}` }; } catch (e) { return { url: null }; }
}
async function refreshAll() {
  const snap = await db.collection('songs').limit(100).get();
  for (const doc of snap.docs) { const s = doc.data(); if (s.thumb_file_id) { const { url } = await freshThumb(s.thumb_file_id); if (url) await doc.ref.update({ thumb_url: url, thumb_updated_at: Date.now() }); } }
}
module.exports = { freshThumb, refreshAll };
