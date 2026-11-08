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
} catch (e) { console.error("Firebase Error:", e.message); }

const db = admin.firestore();
const BOTS = (process.env.TG_BOTS || '').split(',').filter(Boolean);
let rrIndex = 0;

const app = express();
const router = express.Router();

router.use(express.json());
router.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', '*'); next(); });

router.get('/songs', async (req, res) => {
  try {
    let allSongs = [];
    const chunksSnap = await db.collection('vaultify_shared').doc('library_main').collection('chunks').get();
    if (chunksSnap.empty) return res.status(404).json({ error: "No chunks" });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 302 Redirect for INSTANT play (Bypasses Vercel download)
router.get('/audio', async (req, res) => {
  const fileId = req.query.file_id;
  if (req.query.url) return res.redirect(req.query.url);
  if (!fileId) return res.status(400).send('No file_id');
  const token = BOTS[rrIndex++ % BOTS.length];
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    if (!data.ok) throw new Error(data.description);
    res.redirect(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`);
  } catch (e) { res.status(500).send(e.message); }
});

router.get('/thumb', async (req, res) => {
  const fileId = req.query.file_id;
  if (!fileId) return res.status(400).send('No file_id');
  const token = BOTS[rrIndex++ % BOTS.length];
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    if (!data.ok) throw new Error(data.description);
    res.redirect(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`);
  } catch (e) { res.status(500).send(e.message); }
});

app.use('/api', router);
app.use('/', router);
module.exports = app;
