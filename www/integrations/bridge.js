(function(){
  const API = window.VAULTIFY_CONFIG?.apiBase || '';
  const ICON_URL = "https://vaultify-v2-gamma.vercel.app/vaultify.png";

  async function api(path, opts = {}) {
    const res = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error("HTTP Status: " + res.status);
    return res.json();
  }

  async function loadRealSongs() {
    try {
      if(typeof toast !== 'undefined') toast("Connecting to Vercel...");
      const res = await api('/songs');
      
      if (res.error) throw new Error("Backend: " + res.error);
      
      if (res.songs && res.songs.length > 0) {
        if (typeof S !== 'undefined') {
            S.length = 0; 
            res.songs.forEach((s, i) => {
                S.push({ 
                  id: i+1, t: s.title, a: s.artist, cat: 'Vaultify', src: 'tg', 
                  c: ['#7c5cff','#00d4ff'], d: s.duration || 180, bpm: 100, 
                  _fileId: s.file_id, _backendId: s.id 
                });
                
                // Image load karo agar backend se aa gayi hai
                if (s.thumb_url && typeof artCache !== 'undefined') {
                    artCache[i+1] = `url('${s.thumb_url}')`;
                }
            });
            
            if (typeof go !== 'undefined') go('home');
            if(typeof toast !== 'undefined') toast("✅ " + res.songs.length + " songs loaded!");
        }
      } else {
        if(typeof toast !== 'undefined') toast("❌ 0 songs. Check backend!");
      }
    } catch (e) {
      console.error(e);
      if(typeof toast !== 'undefined') toast("❌ " + e.message);
    }
  }

  let TRENDING_IDS = [];
  async function loadTrending() {
    try {
      const res = await api('/trending');
      TRENDING_IDS = (res.songs || []).map(bsId => {
        const local = (typeof S !== 'undefined' ? S : []).find(s => s._backendId === bsId);
        return local ? local.id : null;
      }).filter(Boolean);
      if (typeof go !== 'undefined' && typeof U !== 'undefined' && U.tab === 'home') go('home');
    } catch (e) {}
  }

  let audioEl = null, audioCtx = null, sourceNode = null, filters = [];
  const freqs = [60, 230, 910, 3600, 14000];
  
  function setupAudioGraph() {
    if (audioCtx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    sourceNode = audioCtx.createMediaElementSource(audioEl);
    let lastNode = sourceNode;
    freqs.forEach((f, i) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'peaking'; filter.frequency.value = f; filter.Q.value = 1;
      const saved = localStorage.getItem('vaultify_eq_'+i);
      filter.gain.value = saved ? parseFloat(saved) : 0;
      lastNode.connect(filter); lastNode = filter; filters.push(filter);
    });
    lastNode.connect(audioCtx.destination);
  }

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
  window.startCur = function() {
    if (_startCur) _startCur();
    const s = typeof cur !== 'undefined' ? cur() : null;
    if (!s) return;
    
    updateMediaSession(s);

    if (!audioEl) {
      audioEl = new Audio(); 
      // CORS hata diya taaki audio block na ho
      audioEl.addEventListener('timeupdate', () => { 
          if (typeof U !== 'undefined') U.T = audioEl.currentTime; 
          if (typeof tick !== 'undefined') tick(); 
      });
      audioEl.addEventListener('ended', () => { if (typeof next !== 'undefined') next(); });
      setupAudioGraph();
    }
    
    if (s._fileId) { 
      audioEl.src = API + '/audio?file_id=' + encodeURIComponent(s._fileId); 
      if (typeof U !== 'undefined' && U.playing) { 
          if (audioCtx) audioCtx.resume(); 
          audioEl.play().catch((err)=> { console.log("Play error:", err); }); 
      }
    }
  };

  const _toggle = window.toggle;
  window.toggle = function() {
    if (_toggle) _toggle();
    if (audioEl && typeof U !== 'undefined') { 
        if (U.playing) { 
            if (audioCtx) audioCtx.resume(); 
            audioEl.play().catch(()=>{}); 
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        } else { 
            audioEl.pause(); 
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        } 
    }
  };

  const _rHome_orig = window.rHome;
  window.rHome = function() {
      _rHome_orig();
      if (TRENDING_IDS.length > 0 && typeof S !== 'undefined') {
          const home = document.getElementById('s-home');
          const catsHeading = [...home.querySelectorAll('h2')].find(el => el.textContent.includes('Categories'));
          if (catsHeading) {
              const wrap = document.createElement('div');
              wrap.innerHTML = `<h2>Trending this Month <small>AI Curated</small></h2><div class="hrow">${TRENDING_IDS.map(id => { const s = S.find(x => x.id === id); if (!s) return ''; return `<div class="card" data-play="${s.id}" data-ids="${TRENDING_IDS.join(',')}"><div class="art" ${typeof A !== 'undefined' ? A(s) : ''}></div><p>${s.t}</p><span>${s.a}</span></div>`; }).join('')}</div>`;
              catsHeading.parentNode.insertBefore(wrap, catsHeading);
          }
      }
  };

  setTimeout(async () => { await loadRealSongs(); await loadTrending(); }, 1000);

  // ... (Baki Playlist, EQ aur Back button ka code same rahega)
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

  function openEQSheet() {
      if(audioCtx) audioCtx.resume();
      let html = `<h2 style="margin:4px 0 8px">Equalizer</h2><div style="display:flex;justify-content:space-between;align-items:flex-end;height:180px;padding:20px 10px;background:var(--glass);border-radius:20px;margin-bottom:15px;">`;
      freqs.forEach((freq, i) => { let val = filters[i] ? filters[i].gain.value : 0; let label = freq >= 1000 ? (freq/1000) + 'k' : freq; html += `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;"><input type="range" class="eq-slider" data-index="${i}" min="-12" max="12" step="1" value="${val}" style="writing-mode: vertical-lr; direction: rtl; -webkit-appearance: slider-vertical; width: 20px; height: 120px; accent-color: var(--c2);"><span style="font-size:11px;color:var(--mut);font-weight:600">${label}</span></div>`; });
      html += `</div><div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:10px;"><button class="chip on" onclick="applyEQPreset('flat')">Flat</button><button class="chip" onclick="applyEQPreset('bass')">Bass Boost</button><button class="chip" onclick="applyEQPreset('vocal')">Vocal</button><button class="chip" onclick="applyEQPreset('rock')">Rock</button></div>`;
      if(typeof sheet !== 'undefined') sheet(html);
      setTimeout(() => { document.querySelectorAll('.eq-slider').forEach(slider => { slider.addEventListener('input', e => { let idx = parseInt(e.target.dataset.index); let val = parseFloat(e.target.value); if(filters[idx]) filters[idx].gain.value = val; localStorage.setItem('vaultify_eq_'+idx, val); }); }); }, 100);
  }

  window.applyEQPreset = function(preset) {
      const presets = { flat: [0, 0, 0, 0, 0], bass: [8, 5, 0, -1, -2], vocal: [-2, 2, 6, 4, 1], rock: [5, 2, -1, 3, 5] };
      if(!filters.length) return; filters.forEach((f, i) => { f.gain.value = presets[preset][i]; localStorage.setItem('vaultify_eq_'+i, presets[preset][i]); });
      document.querySelectorAll('.eq-slider').forEach(s => { s.value = presets[preset][s.dataset.index]; });
      document.querySelectorAll('#sheet .chip').forEach(c => c.classList.remove('on')); if(event && event.target) event.target.classList.add('on');
  };

  const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
              const full = document.getElementById('full');
              if (full && full.classList.contains('open')) {
                  const fpbot = full.querySelector('.fpbot');
                  if (fpbot && !document.getElementById('eq-btn')) {
                      const btn = document.createElement('button'); btn.id = 'eq-btn'; btn.className = 'glass';
                      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/></svg> EQ`;
                      btn.onclick = openEQSheet; fpbot.appendChild(btn);
                  }
              }
          }
      });
  });
  observer.observe(document.getElementById('full'), { attributes: true });

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
