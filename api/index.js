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
let rrIndex = 0;

const app = express();
const router = express.Router();

router.use(express.json());
router.use((req, res, next) => { 
  res.header('Access-Control-Allow-Origin', '*'); 
  res.header('Access-Control-Allow-Headers', '*'); 
  next(); 
});

// 1. Get All Songs (No limit, fast fetching)
router.get('/songs', async (req, res) => {
  try {
    let allSongs = [];
    const chunksSnap = await db.collection('vaultify_shared').doc('library_main').collection('chunks').get();
    if (chunksSnap.empty) return res.status(404).json({ error: "No chunks found" });

    let idx = 0;
    chunksSnap.forEach(doc => {
      const data = doc.data();
      for (const key in data) {
        if (Array.isArray(data[key])) {
          data[key].forEach(s => {
            if(typeof s === 'object') {
              allSongs.push({
                id: s.id || s.songId || `song_${idx++}`,
                title: s.title || s.name || s.songName || 'Unknown Title',
                artist: s.artist || s.singer || s.artistName || 'Unknown Artist',
                file_id: s.file_id || s.fileId || s.document_file_id || s.audio_file_id || s.url || null,
                audio_url: s.audio_url || s.url || null,
                duration: s.duration || s.time || 180,
                thumb_file_id: s.thumb || s.thumbnail || s.thumb_file_id || null,
                thumb_url: s.thumb_url || s.image || s.img_url || null
              });
            }
          });
        }
      }
    });
    res.json({ count: allSongs.length, songs: allSongs });
  } catch (e) { 
    res.status(500).json({ error: "Firebase Error: " + e.message }); 
  }
});

// 2. Audio Stream (Handles both TG file_id and JioSaavn url)
router.get('/audio', async (req, res) => {
  const fileId = req.query.file_id;
  const audioUrl = req.query.url;

  if (audioUrl) {
    try {
      const stream = await axios.get(audioUrl, { responseType: 'stream' });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return stream.data.pipe(res);
    } catch (e) { return res.status(500).send(e.message); }
  }

  if (!fileId) return res.status(400).send('file_id missing');
  const token = BOTS[rrIndex++ % BOTS.length];
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    if (!data.ok) throw new Error(data.description);
    const stream = await axios.get(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    stream.data.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

// 3. Thumbnail Proxy (Direct Telegram image link)
router.get('/thumb', async (req, res) => {
  const fileId = req.query.file_id;
  if (!fileId) return res.status(400).send('No file_id');
  const token = BOTS[rrIndex++ % BOTS.length];
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    if (!data.ok) throw new Error(data.description);
    const url = `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
    res.redirect(url); // Fast redirect to actual image
  } catch (e) { res.status(500).send(e.message); }
});

// 4. JioSaavn Search
router.get('/jio-search', async (req, res) => {
  try {
    const { data } = await axios.get(`https://saavn.dev/api/search/songs`, { params: { query: req.query.q, limit: 20 } });
    const songs = (data?.data?.results || []).map(s => ({
      id: 'jio_' + s.id, title: s.name, artist: s.artists?.primary?.[0]?.name || 'Unknown',
      duration: s.duration, audio_url: s.downloadUrl?.find(d => d.quality === '320kbps')?.link || s.downloadUrl?.[0]?.link,
      thumb_url: s.image?.[2]?.link || s.image?.[0]?.link
    })).filter(s => s.audio_url);
    res.json({ songs });
  } catch (e) { res.json({ songs: [] }); }
});

// 5. Telegram Search (Local)
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json({ songs: [] });
    // Just reusing the full list for now, frontend filters it
    res.json({ songs: [] }); 
  } catch (e) { res.json({ songs: [] }); }
});

router.get('/trending', async (req, res) => { res.json({ songs: [] }); });
router.post('/tg-webhook', async (req, res) => { res.json({ ok: true }); });

app.use('/api', router);
app.use('/', router);
module.exports = app;
