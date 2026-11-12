(function(){
  const API = window.VAULTIFY_CONFIG?.apiBase || '';
  const ICON_URL = "https://vaultify-v2-gamma.vercel.app/vaultify.png";

  // --- 1. LOAD SONGS ---
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
                // Thumbnail Fix
                if (s.thumb_url && typeof artCache !== 'undefined') {
                    artCache[i+1] = `url('${API}${s.thumb_url}')`;
                }
            });
            if (typeof go !== 'undefined') go('home');
        }
      }
    } catch (e) { console.log("Song fetch error:", e); }
  }

  // --- 2. AUDIO PLAYER & NOTIFICATION ---
  let audioEl = new Audio();
  audioEl.preload = "auto";
  
  audioEl.addEventListener('timeupdate', () => { 
      if (typeof U !== 'undefined') U.T = audioEl.currentTime; 
      if (typeof tick !== 'undefined') tick(); 
  });
  
  audioEl.addEventListener('ended', () => { 
      if (typeof next !== 'undefined') next(); 
  });

  function updateNotification(s, isPlaying) {
      if (!s || !('mediaSession' in navigator)) return;
      try {
          navigator.mediaSession.metadata = new MediaMetadata({
              title: s.t, 
              artist: s.a, 
              album: 'Vaultify',
              artwork: [{ src: ICON_URL, sizes: '512x512', type: 'image/png' }]
          });
          navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
          
          navigator.mediaSession.setActionHandler('play', () => { if(typeof toggle !== 'undefined') toggle(); });
          navigator.mediaSession.setActionHandler('pause', () => { if(typeof toggle !== 'undefined') toggle(); });
          navigator.mediaSession.setActionHandler('nexttrack', () => { if(typeof next !== 'undefined') next(); });
          navigator.mediaSession.setActionHandler('previoustrack', () => { if(typeof prev !== 'undefined') prev(); });
      } catch(e) {}
  }

  const _startCur = window.startCur;
  window.startCur = function() {
    if (_startCur) _startCur();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (!s) return;

    // INSTANT RESET (Fixes next song not playing)
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.src = "";

    // Direct Telegram Link
    if (s._fileId) {
      audioEl.src = API + '/audio?file_id=' + encodeURIComponent(s._fileId);
      if (typeof U !== 'undefined' && U.playing) {
          audioEl.play().then(() => updateNotification(s, true)).catch(e => console.log("Play err:", e));
      }
    } else if (s._audioUrl) {
      audioEl.src = s._audioUrl;
      if (typeof U !== 'undefined' && U.playing) {
          audioEl.play().then(() => updateNotification(s, true)).catch(e => console.log("Play err:", e));
      }
    }
  };

  const _toggle = window.toggle;
  window.toggle = function() {
    if (_toggle) _toggle();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (typeof U !== 'undefined') { 
        if (U.playing) { 
            audioEl.play().catch(()=>{}); 
            updateNotification(s, true);
        } else { 
            audioEl.pause(); 
            updateNotification(s, false);
        } 
    }
  };

  // --- 3. PLAYLIST VIEW LOGIC ---
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
          html += `</div>`; 
          if(typeof sheet !== 'undefined') sheet(html); 
          return;
      }
      
      const songRow = e.target.closest('[data-plsong]');
      if (songRow) {
          e.stopPropagation(); e.preventDefault();
          if(typeof U !== 'undefined') U.shuf = true;
          if(typeof playIds !== 'undefined') playIds(songRow.dataset.plids.split(',').map(Number), parseInt(songRow.dataset.plidx));
          if(typeof closeSheet !== 'undefined') closeSheet(); 
          return;
      }
  }, true);

  // Boot
  setTimeout(async () => { await loadRealSongs(); }, 800);

})();
