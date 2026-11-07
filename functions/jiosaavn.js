const axios = require('axios');
async function search(q) {
  if (!q) return { songs: [] };
  try {
    const { data } = await axios.get(`https://saavn.dev/api/search/songs`, { params: { query: q, limit: 20 } });
    const songs = (data?.data?.results || []).map(s => ({ id: 'jio_' + s.id, title: s.name, artist: s.artists?.primary?.[0]?.name || 'Unknown', duration: s.duration || 0, audio_url: s.downloadUrl?.find(d => d.quality === '320kbps')?.link || s.downloadUrl?.[0]?.link, thumb_url: s.image?.[2]?.link || s.image?.[0]?.link })).filter(s => s.audio_url);
    return { songs };
  } catch (e) { return { songs: [] }; }
}
module.exports = { search };
