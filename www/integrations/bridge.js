(function(){
  const API = window.VAULTIFY_CONFIG?.apiBase || '';
  const ICON_URL = "https://vaultify-v2-gamma.vercel.app/vaultify.png";

  // --- 1. CACHE ENGINE (Real Storage) ---
  let maxCacheMB = 500;
  try {
    const c = JSON.parse(localStorage.getItem('vaultify_cache') || '{}');
    if (c.maxMB) maxCacheMB = c.maxMB;
  } catch(e) {}

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
      let totalSize = 0;
      let files = [];
      for (const f of res.files) {
        if (f.name.startsWith('song_') && f.name.endsWith('.mp3')) {
          totalSize += f.size;
          files.push(f);
        }
      }
      let totalMB = totalSize / (1024 * 1024);
      if (totalMB <= maxCacheMB) return;
      files.sort((a, b) => a.mtime - b.mtime); // Delete oldest
      for (const f of files) {
        if (totalMB <= maxCacheMB) break;
        await window.Capacitor.Plugins.Filesystem.deleteFile({ path: f.name, directory: 'CACHE' });
        totalMB -= (f.size / (1024 * 1024));
      }
    } catch(e) {}
  }

  // --- 2. LOAD SONGS ---
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
                  _fileId: s.file_id, _audioUrl: s.audio_url, _backendId: s.id 
                });
                if (s.thumb_url) {
                    if (typeof artCache !== 'undefined') artCache[i+1] = `url('${s.thumb_url}')`;
                } else if (s.thumb_file_id) {
                    if (typeof artCache !== 'undefined') artCache[i+1] = `url('${API}/thumb?file_id=${s.thumb_file_id}')`;
                }
            });
            if (typeof go !== 'undefined') go('home');
        }
      }
    } catch (e) { console.log("Load error:", e); }
  }

  // --- 3. AUDIO PLAYER ---
  let audioEl = null;
  
  function updateMediaSession(s) {
      if (!s || !('mediaSession' in navigator)) return;
      try {
          navigator.mediaSession.metadata = new MediaMetadata({
              title: s.t, artist: s.a, album: 'Vaultify',
              artwork: [{ src: ICON_URL, sizes: '512x512', type: 'image/png' }]
          });
          navigator.mediaSession.setActionHandler('play', () => { if(typeof toggle !== 'undefined') toggle(); });
          navigator.mediaSession.setActionHandler('pause', () => { if(typeof toggle !== 'undefined') toggle(); });
          navigator.mediaSession.setActionHandler('nexttrack', () => { if(typeof next !== 'undefined') next(); });
          navigator.mediaSession.setActionHandler('previoustrack', () => { if(typeof prev !== 'undefined') prev(); });
      } catch(e) {}
  }

  const _startCur = window.startCur;
  window.startCur = async function() {
    if (_startCur) _startCur();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (!s) return;
    updateMediaSession(s);

    if (!audioEl) {
      audioEl = new Audio(); 
      audioEl.preload = "auto"; // Instant play
      audioEl.addEventListener('timeupdate', () => { 
          if (typeof U !== 'undefined') U.T = audioEl.currentTime; 
          if (typeof tick !== 'undefined') tick(); 
      });
      audioEl.addEventListener('ended', () => { if (typeof next !== 'undefined') next(); });
    }
    
    // 1. Check Real Cache
    let srcUrl = await getCachedUrl(s);
    
    // 2. If not cached, play direct & download in background
    if (!srcUrl) {
      if (s._fileId) srcUrl = API + '/audio?file_id=' + encodeURIComponent(s._fileId);
      else if (s._audioUrl) srcUrl = API + '/audio?url=' + encodeURIComponent(s._audioUrl);
      if (s._fileId) downloadSong(s); // Background download
    }

    if (srcUrl) { 
      audioEl.src = srcUrl; 
      if (typeof U !== 'undefined' && U.playing) { 
          audioEl.play().catch((err)=> { console.log("Play error:", err); }); 
      }
    }
  };

  const _toggle = window.toggle;
  window.toggle = function() {
    if (_toggle) _toggle();
    if (audioEl && typeof U !== 'undefined') { 
        if (U.playing) { audioEl.play().catch(()=>{}); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing"; } 
        else { audioEl.pause(); if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused"; } 
    }
  };

  setTimeout(async () => { await loadRealSongs(); }, 800);

  // --- 4. PLAYLIST & BACK BUTTON ---
  document.addEventListener('click', function(e) {
      const plRow = e.target.closest('[data-pl]');
      if (plRow && !e.target.closest('[data-plplay]')) {
          e.stopPropagation(); e.preventDefault();
          const pl = (typeof D !== 'undefined' ? D.pls : []).find(p => p.id == plRow.dataset.pl); 
          if (!pl || !pl.ids.length) return;
          let html = `<h2 style="margin:4px 0 8px">${pl.name}</h2><div class="list">`;
          pl.ids.forEach((id, idx) => { 
              const s = (typeof S !== 'undefined' ? S : []).find(x => x.id === id); 
              if (s) html += `<div class="row" data-plsong="${id}" data-plids="${pl.ids.join(',')}" data-plidx="${idx}"><div class="m" style="display:flex;align-items:center;gap:12px"><span style="color:var(--mut);font-size:14px;width:18px;font-weight:600">${idx + 1}</span><div><b>${s.t}</b><span>${s.a}</span></div></div><button class="dots">${typeof ic !== 'undefined' ? ic('play', 18) : '▶'}</button></div>`; 
          });
          html += `</div>`; if(typeof sheet !== 'undefined') sheet(html); return;
      }
      const songRow = e.target.closest('[data-plsong]');
      if (songRow) {
          e.stopPropagation(); e.preventDefault();
          if(typeof U !== 'undefined') U.shuf = true;
          if(typeof playIds !== 'undefined') playIds(songRow.dataset.plids.split(',').map(Number), parseInt(songRow.dataset.plidx));
          if(typeof closeSheet !== 'undefined') closeSheet(); return;
      }
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
          const { App } = window.Capacitor.Plugins;
          App.addListener('backButton', ({ canGoBack }) => {
              const ov = document.getElementById('ov');
              if (ov && ov.classList.contains('show')) { if (typeof closeSheet !== 'undefined') closeSheet(); return; }
              const full = document.getElementById('full');
              if (full && full.classList.contains('open')) { if (typeof closeFull !== 'undefined') closeFull(); return; }
              if (typeof U !== 'undefined' && U.tab !== 'home') { if (typeof go !== 'undefined') go('home'); return; }
              if (canGoBack) { window.history.back(); } else { App.exitApp(); }
          });
      }
  });
})();
