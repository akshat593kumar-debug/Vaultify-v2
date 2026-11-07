const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      })
    });
  }
} catch (e) { console.error("❌ Firebase Error:", e.message); }

const db = admin.firestore();
const BOTS = (process.env.TG_BOTS || '').split(',').filter(Boolean);
const KEYS = (process.env.GEMINI_KEYS || '').split(',').filter(Boolean);
let rrIndex = 0, rrKey = 0;

function nextBot() { if (!BOTS.length) return null; rrIndex = (rrIndex + 1) % BOTS.length; return BOTS[rrIndex]; }
function nextKey() { if (!KEYS.length) return null; rrKey = (rrKey + 1) % KEYS.length; return KEYS[rrKey]; }

const app = express();
const router = express.Router();

router.use(express.json());
router.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', '*'); next(); });

// --- HELPER: Fetch from chunks (c0, c1) and map to standard format ---
async function getAllSongs() {
  let allSongs = [];
  try {
    const chunksSnap = await db.collection('vaultify_shared').doc('library_main').collection('chunks').get();
    let idx = 0;
    chunksSnap.forEach(doc => {
      const data = doc.data();
      // Find any array of objects in the chunk
      for (const key in data) {
        if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === 'object') {
          data[key].forEach(s => {
            allSongs.push({
              id: s.id || s.songId || `song_${idx++}`,
              title: s.title || s.name || s.songName || 'Unknown Title',
              artist: s.artist || s.singer || s.artistName || 'Unknown Artist',
              file_id: s.file_id || s.fileId || s.url || s.audio_url || s.file || null,
              duration: s.duration || s.time || 180,
              thumb: s.thumb || s.thumbnail || s.image || s.imageUrl || null
            });
          });
        }
      }
    });
  } catch (e) { console.error("Chunk fetch error:", e.message); }
  return allSongs;
}

// 1. Get All Songs
router.get('/songs', async (req, res) => {
  try {
    const songs = await getAllSongs();
    res.json({ songs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Search
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ songs: [] });
    const allSongs = await getAllSongs();
    const songs = allSongs.filter(s => (s.title + ' ' + s.artist).toLowerCase().includes(q)).slice(0, 30);
    res.json({ songs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Audio Stream
router.get('/audio', async (req, res) => {
  const fileId = req.query.file_id;
  const token = nextBot();
  if (!fileId || !token) return res.status(400).json({ error: 'file_id or bot missing' });
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    const stream = await axios.get(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.data.pipe(res);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. AI Next
router.get('/ai-next', async (req, res) => {
  try {
    const allSongs = await getAllSongs();
    if (!allSongs.length) return res.json({ id: null });
    const key = nextKey();
    if (!key) return res.json({ id: allSongs[0].id, reason: 'Fallback (No Key)' });
    
    const list = allSongs.slice(0, 50).map((s, i) => `${i}. ${s.title} — ${s.artist}`).join('\n');
    const { data } = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      contents: [{ parts: [{ text: `Pick best next song index ONLY:\n${list}\nRecent: ${req.query.recent || ''}` }] }]
    });
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '0';
    const idx = parseInt(reply.match(/\d+/)?.[0] || '0');
    res.json({ id: allSongs[idx]?.id || allSongs[0].id, reason: 'AI Pick' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. Trending
router.get('/trending', async (req, res) => {
  try {
    const docRef = db.collection('sys_cache').doc('trending');
    const doc = await docRef.get();
    const now = Date.now();
    if (doc.exists && (now - doc.data().updated_at < 2592000000)) {
      return res.json({ songs: doc.data().songs });
    }
    const allSongs = await getAllSongs();
    const trendingIds = allSongs.sort(() => 0.5 - Math.random()).slice(0, 15).map(s => s.id);
    await docRef.set({ songs: trendingIds, updated_at: now });
    res.json({ songs: trendingIds });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 6. JioSaavn & Telegram Webhook
router.get('/jio-search', async (req, res) => {
  try {
    const { data } = await axios.get(`https://saavn.dev/api/search/songs`, { params: { query: req.query.q, limit: 20 } });
    const songs = (data?.data?.results || []).map(s => ({
      id: 'jio_' + s.id, title: s.name, artist: s.artists?.primary?.[0]?.name || 'Unknown',
      duration: s.duration, audio_url: s.downloadUrl?.find(d => d.quality === '320kbps')?.link || s.downloadUrl?.[0]?.link
    })).filter(s => s.audio_url);
    res.json({ songs });
  } catch (e) { res.json({ songs: [] }); }
});

router.post('/tg-webhook', async (req, res) => {
  const msg = req.body.channel_post || req.body.message;
  if (msg && msg.document) {
    const title = msg.document.file_name?.replace(/\.[^.]+$/, '') || 'Untitled';
    const parts = title.split(/ - |–|—/);
    // Save new songs directly to c1 chunk (or create a new collection for new songs)
    await db.collection('vaultify_shared').doc('library_main').collection('chunks').doc('c1').set({
        new_songs: admin.firestore.FieldValue.arrayUnion({
            title: (parts[0] || title).trim(), 
            artist: (parts[1] || 'Unknown').trim(),
            file_id: msg.document.file_id, 
            duration: msg.document.duration || 0,
            thumbnail: msg.document.thumbnail?.file_id || null
        })
    }, { merge: true });
  }
  res.json({ ok: true });
});

// 7. Team Mode
router.post('/team/create', async (req, res) => {
  const code = 'VLT-' + Array.from({length: 4}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
  await db.collection('rooms').doc(code).set({ code, host: req.body.user, members: [req.body.user], chat: [], created_at: Date.now() });
  res.json({ code });
});
router.post('/team/join', async (req, res) => { await db.collection('rooms').doc(req.body.code).update({ members: admin.firestore.FieldValue.arrayUnion(req.body.user) }); res.json({ ok: true }); });
router.post('/team/send', async (req, res) => { await db.collection('rooms').doc(req.body.code).update({ chat: admin.firestore.FieldValue.arrayUnion({ user: req.body.user, t: req.body.text, at: Date.now() }) }); res.json({ ok: true }); });
router.get('/team/get', async (req, res) => { const doc = await db.collection('rooms').doc(req.query.code).get(); res.json({ room: doc.exists ? doc.data() : null }); });

app.use('/api', router);
app.use('/', router);

module.exports = app;
