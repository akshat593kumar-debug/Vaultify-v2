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
router.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', '*'); next(); });

// Helper: Telegram file_id se direct URL nikalna
async function getTgUrl(fileId) {
  if (!fileId) return null;
  const token = BOTS[rrIndex++ % BOTS.length];
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  } catch (e) { return null; }
}

router.get('/songs', async (req, res) => {
  try {
    let allSongs = [];
    const chunksSnap = await db.collection('vaultify_shared').doc('library_main').collection('chunks').get();
    
    if (chunksSnap.empty) return res.status(404).json({ error: "No chunks found" });

    let idx = 0;
    let count = 0;
    
    for (const doc of chunksSnap.docs) {
      const data = doc.data();
      for (const key in data) {
        if (Array.isArray(data[key])) {
            for (const s of data[key]) {
                if(typeof s === 'object' && count < 40) { // Limit to 40 for fast loading
                    // Agar thumb ya file_id hai, toh direct link banao
                    let thumbUrl = s.thumb_url || s.image || s.img_url || null;
                    if (!thumbUrl && (s.thumb || s.thumbnail || s.thumb_file_id)) {
                        thumbUrl = await getTgUrl(s.thumb || s.thumbnail || s.thumb_file_id);
                    }
                    
                    allSongs.push({
                        id: s.id || s.songId || `song_${idx++}`,
                        title: s.title || s.name || s.songName || 'Unknown Title',
                        artist: s.artist || s.singer || s.artistName || 'Unknown Artist',
                        file_id: s.file_id || s.fileId || s.document_file_id || s.audio_file_id || null,
                        duration: s.duration || s.time || 180,
                        thumb_url: thumbUrl
                    });
                    count++;
                }
            }
        }
      }
    }
    res.json({ count: allSongs.length, songs: allSongs });
  } catch (e) { 
    res.status(500).json({ error: "Firebase Error: " + e.message }); 
  }
});

router.get('/audio', async (req, res) => {
  const fileId = req.query.file_id;
  const url = req.query.url;

  if (url) {
    try {
      const stream = await axios.get(url, { responseType: 'stream' });
      res.setHeader('Content-Type', 'audio/mpeg');
      return stream.data.pipe(res);
    } catch (e) { return res.status(500).send(e.message); }
  }

  const token = BOTS[rrIndex++ % BOTS.length];
  if (!fileId || !token) return res.status(400).send('file_id missing');
  try {
    const { data } = await axios.get(`https://api.telegram.org/bot${token}/getFile`, { params: { file_id: fileId } });
    const stream = await axios.get(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`, { responseType: 'stream' });
    res.setHeader('Content-Type', 'audio/mpeg');
    stream.data.pipe(res);
  } catch (e) { res.status(500).send(e.message); }
});

router.get('/search', async (req, res) => { res.json({ songs: [] }); }); 
router.get('/trending', async (req, res) => { res.json({ songs: [] }); });
router.post('/tg-webhook', async (req, res) => { res.json({ ok: true }); });

app.use('/api', router);
app.use('/', router);
module.exports = app;
