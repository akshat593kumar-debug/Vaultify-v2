(function(){
  const API = window.VAULTIFY_CONFIG?.apiBase || '';
  const ICON_URL = "https://vaultify-v2-gamma.vercel.app/vaultify.png";
  const MAX_CACHE_MB = 500;

  const MusicControls = window.Capacitor?.Plugins?.MusicControls;

  async function getCachedUrl(song) {
    if (!window.Capacitor || !window.Capacitor.Plugins.Filesystem) return null;
    try {
      const path = `song_${song.id}.mp3`;
      const stat = await window.Capacitor.Plugins.Filesystem.stat({ path, directory: 'CACHE' });
      if (stat && stat.size > 0) {
        const uriResult = await window.Capacitor.Plugins.Filesystem.getUri({ path, directory: 'CACHE' });
        return window.Capacitor.convertFileSrc(uriResult.uri);
      }
    } catch(e) {}
    return null;
  }

  async function downloadSong(song) {
    if (!window.Capacitor || !window.Capacitor.Plugins.Filesystem) return;
    const path = `song_${song.id}.mp3`;
    const url = API + '/audio?file_id=' + encodeURIComponent(song._fileId);
    try {
      await window.Capacitor.Plugins.Filesystem.downloadFile({ url: url, path: path, directory: 'CACHE', recursive: true });
      await enforceCacheLimit();
    } catch(e) {}
  }

  async function enforceCacheLimit() {
    if (!window.Capacitor || !window.Capacitor.Plugins.Filesystem) return;
    try {
      const res = await window.Capacitor.Plugins.Filesystem.readdir({ path: '', directory: 'CACHE' });
      let totalSize = 0, files = [];
      for (const f of res.files) {
        if (f.name.startsWith('song_') && f.name.endsWith('.mp3')) {
          totalSize += f.size;
          files.push(f);
        }
      }
      let totalMB = totalSize / (1024 * 1024);
      if (totalMB <= MAX_CACHE_MB) return;
      files.sort((a, b) => a.mtime - b.mtime);
      for (const f of files) {
        if (totalMB <= MAX_CACHE_MB) break;
        await window.Capacitor.Plugins.Filesystem.deleteFile({ path: f.name, directory: 'CACHE' });
        totalMB -= (f.size / (1024 * 1024));
      }
    } catch(e) {}
  }

  async function loadRealSongs() {
    try {
      const res = await fetch(API + '/songs').then(r => r.json());
      if (res.error) throw new Error(res.error);
      if (res.songs && res.songs.length > 0) {
        if (typeof S !== 'undefined') {
            S.length = 0; 
            res.songs.forEach((s, i) => {
                S.push({ 
                  id: i+1, t: s.title, a: s.artist, cat: 'Vaultify', src: 'tg', 
                  c: ['#7c5cff','#00d4ff'], d: s.duration || 180, bpm: 100, 
                  _fileId: s.file_id, _backendId: s.id 
                });
                if (s.thumb_url) {
                    if (typeof artCache !== 'undefined') artCache[i+1] = `url('${API}${s.thumb_url}')`;
                }
            });
            if (typeof go !== 'undefined') go('home');
        }
      }
    } catch (e) { console.log(e); }
  }

  let audioEl = null;
  
  function updateNotification(s, isPlaying) {
    if (MusicControls) {
        MusicControls.create({
            track: s.t,
            artist: s.a,
            cover: ICON_URL,
            isPlaying: isPlaying,
            dismissable: true,
            hasPrev: true,
            hasNext: true,
            hasClose: true
        });
    } else if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: s.t, artist: s.a, artwork: [{ src: ICON_URL }] });
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }

  const _startCur = window.startCur;
  window.startCur = async function() {
    if (_startCur) _startCur();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (!s) return;

    if (!audioEl) {
      audioEl = new Audio(); 
      audioEl.preload = "auto";
      audioEl.addEventListener('timeupdate', () => { 
          if (typeof U !== 'undefined') U.T = audioEl.currentTime; 
          if (typeof tick !== 'undefined') tick(); 
      });
      audioEl.addEventListener('ended', () => { if (typeof next !== 'undefined') next(); });
    }
    
    audioEl.pause();
    audioEl.src = "";
    audioEl.load();

    let srcUrl = await getCachedUrl(s);
    if (!srcUrl) {
      if (s._fileId) srcUrl = API + '/audio?file_id=' + encodeURIComponent(s._fileId);
      if (s._fileId) downloadSong(s); 
    }

    if (srcUrl) { 
      audioEl.src = srcUrl; 
      if (typeof U !== 'undefined' && U.playing) { 
          audioEl.play().catch((err)=> { console.log("Play error:", err); }); 
          updateNotification(s, true);
      }
    }
  };

  const _toggle = window.toggle;
  window.toggle = function() {
    if (_toggle) _toggle();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (audioEl && typeof U !== 'undefined') { 
        if (U.playing) { 
            audioEl.play().catch(()=>{}); 
            updateNotification(s, true);
        } else { 
            audioEl.pause(); 
            updateNotification(s, false);
        } 
    }
  };

  // Notification Controls
  if (MusicControls) {
      MusicControls.subscribe({ action: 'play' }).then(() => { if (!window.U.playing) window.toggle(); });
      MusicControls.subscribe({ action: 'pause' }).then(() => { if (window.U.playing) window.toggle(); });
      MusicControls.subscribe({ action: 'next' }).then(() => { window.next(); });
      MusicControls.subscribe({ action: 'prev' }).then(() => { window.prev(); });
      MusicControls.subscribe({ action: 'close' }).then(() => { if (window.U.playing) window.toggle(); });
      MusicControls.listen();
  }

  setTimeout(async () => { await loadRealSongs(); }, 800);
})();
