const admin = require('firebase-admin');
const db = admin.firestore();
const mkCode = () => 'VLT-' + Array.from({length: 4}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
async function create({ user }) { const code = mkCode(); await db.collection('rooms').doc(code).set({ code, host: user, members: [user], chat: [], created_at: Date.now() }); return { code }; }
async function join({ code, user }) { const ref = db.collection('rooms').doc(code); if (!(await ref.get()).exists) throw new Error('Room not found'); await ref.update({ members: admin.firestore.FieldValue.arrayUnion(user) }); return { ok: true }; }
async function send({ code, user, text }) { await db.collection('rooms').doc(code).update({ chat: admin.firestore.FieldValue.arrayUnion({ user, t: text, at: Date.now() }) }); return { ok: true }; }
async function get(code) { const doc = await db.collection('rooms').doc(code).get(); return { room: doc.exists ? doc.data() : null }; }
async function setSong({ code, user, song_id }) { await db.collection('rooms').doc(code).update({ current_song: song_id, updated_by: user, updated_at: Date.now() }); return { ok: true }; }
module.exports = { create, join, send, get, setSong };
