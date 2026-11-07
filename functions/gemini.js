const axios = require('axios');
const admin = require('firebase-admin');
const db = admin.firestore();
const KEYS = (process.env.GEMINI_KEYS || '').split(',').filter(Boolean);
let rr = 0;

async function callGemini(prompt) {
  const key = KEYS[rr++ % KEYS.length];
  const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, { contents: [{ parts: [{ text: prompt }] }] }, { timeout: 15000 });
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function aiNext({ current_id, recent = '' }) {
  const snap = await db.collection('songs').limit(100).get();
  const songs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!songs.length) return { id: null };
  const list = songs.map((s, i) => `${i}. ${s.title} — ${s.artist}`).join('\n');
  try {
    const reply = await callGemini(`Pick best next song index ONLY:\n${list}\nRecent: ${recent}`);
    const idx = parseInt(reply.match(/\d+/)?.[0] || '0');
    return { id: songs[idx]?.id || songs[0].id, reason: 'AI Pick' };
  } catch (e) { return { id: songs[0].id, reason: 'Fallback' }; }
}
module.exports = { aiNext };
