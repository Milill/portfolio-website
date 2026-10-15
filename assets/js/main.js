/*
  Portfolio site script.
  Reads data/site.json and data/works.json, then builds:
  the hero timeline, the filterable work grid, the about/contact
  sections and the video player.
*/
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FPS = 25;
  const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

  let site = {};
  let works = [];
  const cats = new Map();
  let filter = 'all';

  const cat = id => cats.get(id) || { id, name: id || 'Other', color: '#ABA4BA', track: 'V1' };

  setupNav();
  setupPlayer();
  init();

  // Live preview: the admin's Design tab sends draft settings here.
  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'portfolio-theme') return;
    Theme.apply(e.data.theme);
    document.documentElement.classList.remove('pending');
  });

  async function load(path) {
    // Cache-buster so new uploads show up right after GitHub Pages rebuilds.
    const res = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${path} returned ${res.status}`);
    return res.json();
  }

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    try {
      const [s, w] = await Promise.all([load('data/site.json'), load('data/works.json')]);
      site = s || {};
      Theme.apply(site.theme);
      document.documentElement.classList.remove('pending');
      works = (w.works || []).filter(x => x && x.title);
      (site.categories || []).forEach(c => cats.set(c.id, c));
      renderProfile();
      renderTimeline();
      renderBins();
      renderGrid();
      if (window.parent !== window) window.parent.postMessage({ type: 'portfolio-ready' }, location.origin);
      if (w.updated) {
        const d = new Date(w.updated + 'T00:00:00');
        if (!Number.isNaN(d.getTime())) {
          $('#updated').textContent = 'Work last updated ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }
    } catch (err) {
      console.error(err);
      Theme.apply(site.theme);
      document.documentElement.classList.remove('pending');
      const why = location.protocol === 'file:'
        ? 'Browsers block data files opened straight from your computer. Open the site through GitHub Pages, or run a local server (see README).'
        : 'Check that data/works.json and data/site.json exist and are valid JSON.';
      $('#grid').innerHTML = `<p class="notice">Work couldn't load. ${why}</p>`;
    }
  }

  /* ---------------- Profile, about, contact ---------------- */

  function renderProfile() {
    const name = site.name || 'Your Name';
    document.querySelectorAll('[data-bind]').forEach(el => {
      const v = site[el.dataset.bind];
      if (v) el.textContent = v;
    });
    document.title = site.role ? `${name}, ${site.role}` : name;
    const desc = document.querySelector('meta[name="description"]');
    if (desc && site.intro) desc.content = site.intro;

    // Portrait
    const portrait = $('#portrait');
    if (site.photo) {
      portrait.innerHTML = `<img src="${esc(Media.resolve(site.photo))}" alt="${esc(name)}">`;
    } else {
      const initials = name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
      portrait.innerHTML = `<div class="initials" aria-hidden="true">${esc(initials)}</div>`;
    }

    // Bio: array of paragraphs or one string with blank lines
    const bio = Array.isArray(site.bio) ? site.bio : String(site.bio || '').split(/\n\s*\n/);
    $('#bio').innerHTML = bio.filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');

    const facts = [];
    if (site.availability) facts.push(`<span><i class="live-dot" aria-hidden="true"></i>${esc(site.availability)}</span>`);
    if (site.location) facts.push(`<span>${esc(site.location)}</span>`);
    $('#facts').innerHTML = facts.join('');

    $('#makes').innerHTML = (site.categories || []).filter(c => c.blurb).map(c =>
      `<div style="--c:${esc(c.color)}"><dt><span class="swatch"></span>${esc(c.name)}</dt><dd>${esc(c.blurb)}</dd></div>`
    ).join('');

    $('#tools').innerHTML = (site.tools || []).map(t => `<li>${esc(t)}</li>`).join('');

    const email = $('#email');
    if (site.email) {
      email.href = `mailto:${site.email}`;
      email.textContent = site.email;
    } else {
      email.hidden = true;
    }

    $('#socials').innerHTML = (site.socials || []).filter(s => s.url).map(s =>
      `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label || s.url)}</a></li>`
    ).join('');
  }

  /* ---------------- Hero timeline ---------------- */

  let clips = [];
  let totalReal = 0;
  let p = 0;
  let introRaf = 0;
  let current = null;

  function timecode(sec) {
    const s = Math.floor(sec);
    const f = Math.floor((sec - s) * FPS);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, f].map(n => String(n).padStart(2, '0')).join(':');
  }

  function realAt(pos) {
    if (!clips.length) return 0;
    if (pos >= 1) return totalReal;
    const c = clips.find(k => pos >= k.l && pos < k.r) || clips[0];
    return c.t0 + ((pos - c.l) / (c.r - c.l)) * c.dur;
  }

  function clipAt(pos) {
    return clips.find(k => pos >= k.l && pos < k.r) || (pos >= 1 ? clips[clips.length - 1] : null);
  }

  function renderTimeline() {
    let featured = works.filter(w => w.featured);
    if (!featured.length) featured = works.slice(0, 6);
    featured = featured.slice(0, 12);
    if (!featured.length) return;

    // Layout widths are softened so one long film doesn't swallow the timeline;
    // the timecode still reflects real durations.
    const weights = featured.map(w => clamp(Media.seconds(w.duration) || 30, 15, 140));
    const totalW = weights.reduce((a, b) => a + b, 0);
    let accW = 0;
    let accR = 0;
    clips = featured.map((w, i) => {
      const dur = Media.seconds(w.duration) || 30;
      const c = { w, cat: cat(w.category), l: accW / totalW, r: (accW + weights[i]) / totalW, t0: accR, dur };
      accW += weights[i];
      accR += dur;
      return c;
    });
    totalReal = accR;

    const laneV1 = $('#laneV1');
    const laneV2 = $('#laneV2');
    clips.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clip';
      b.style.cssText = `left:${c.l * 100}%;width:calc(${(c.r - c.l) * 100}% - 3px);--c:${c.cat.color}`;
      b.setAttribute('aria-label', `Play ${c.w.title}`);
      const parsed = Media.parse(c.w.url);
      const th = Media.thumb(c.w, parsed);
      b.innerHTML = (th ? `<img src="${esc(th)}" alt="" loading="lazy">` : '') + `<span>${esc(c.w.title)}</span>`;
      const img = b.querySelector('img');
      if (img) img.addEventListener('error', () => img.remove());
      b.addEventListener('click', () => {
        stopIntro();
        setP((c.l + c.r) / 2);
        openWork(c.w);
      });
      (c.cat.track === 'V2' ? laneV2 : laneV1).append(b);
    });

    // Ruler labels
    $('#ruler').innerHTML = [0, .25, .5, .75].map(pos =>
      `<span style="left:${pos * 100}%">${timecode(realAt(pos)).slice(0, 8)}</span>`
    ).join('');

    // Waveform: deterministic bars, a lit copy is clipped to the playhead
    const bars = [];
    for (let i = 0; i < 180; i++) {
      const h = 4 + 30 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.113)) * (0.55 + 0.45 * Math.sin(i * 1.7) ** 2);
      bars.push(`<rect x="${i * 2.5}" y="${20 - h / 2}" width="1.4" height="${h.toFixed(1)}" rx=".7"/>`);
    }
    const wave = `<svg viewBox="0 0 450 40" preserveAspectRatio="none" fill="currentColor">${bars.join('')}</svg>`;
    $('#laneA1').innerHTML = wave.replace('<svg', '<svg class="w-base"') + wave.replace('<svg', '<svg class="w-lit"');

    $('#edit').hidden = false;
    setupScrub();

    const target = clips[1] ? (clips[1].l + clips[1].r) / 2 : (clips[0].l + clips[0].r) / 2;
    setP(0);
    if (reduced) setP(target);
    else setTimeout(() => intro(target), 450);
  }

  function setP(v) {
    p = clamp(v, 0, 1);
    const tracks = $('#tracks');
    tracks.style.setProperty('--p', p);
    const t = timecode(realAt(p));
    $('#tc').textContent = t;

    const hit = clipAt(p);
    const ph = $('#playhead');
    ph.setAttribute('aria-valuenow', Math.round(p * 100));
    ph.setAttribute('aria-valuetext', hit ? `${t}, ${hit.w.title}` : t);

    if (hit !== current) {
      current = hit;
      const at = $('#at');
      if (hit) {
        at.innerHTML = `<span class="swatch" style="--c:${esc(hit.cat.color)}"></span><strong>${esc(hit.w.title)}</strong><span class="at-cat">${esc(hit.cat.name)}</span>`;
      } else {
        at.textContent = 'Drag the playhead to preview a clip';
      }
      $('#atPlay').disabled = !hit;
    }
  }

  function intro(target) {
    const start = performance.now();
    const dur = 1700;
    const step = now => {
      const k = Math.min(1, (now - start) / dur);
      setP(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) introRaf = requestAnimationFrame(step);
    };
    introRaf = requestAnimationFrame(step);
  }

  function stopIntro() { cancelAnimationFrame(introRaf); }

  function setupScrub() {
    const tracks = $('#tracks');
    const ph = $('#playhead');
    let dragging = false;

    const fromEvent = e => {
      const r = tracks.getBoundingClientRect();
      const label = tracks.querySelector('.tlabel').offsetWidth;
      setP((e.clientX - r.left - label) / (r.width - label));
    };

    tracks.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.clip')) return;
      stopIntro();
      dragging = true;
      tracks.setPointerCapture(e.pointerId);
      fromEvent(e);
    });
    tracks.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
    const end = () => { dragging = false; };
    tracks.addEventListener('pointerup', end);
    tracks.addEventListener('pointercancel', end);

    ph.addEventListener('keydown', e => {
      const step = e.shiftKey ? 0.1 : 0.01;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { stopIntro(); setP(p + step); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { stopIntro(); setP(p - step); e.preventDefault(); }
      else if (e.key === 'Home') { stopIntro(); setP(0); e.preventDefault(); }
      else if (e.key === 'End') { stopIntro(); setP(1); e.preventDefault(); }
      else if ((e.key === 'Enter' || e.key === ' ') && current) { openWork(current.w); e.preventDefault(); }
    });

    $('#atPlay').addEventListener('click', () => { if (current) openWork(current.w); });
  }

  /* ---------------- Work grid ---------------- */

  function renderBins() {
    const counts = works.reduce((m, w) => (m[w.category] = (m[w.category] || 0) + 1, m), {});
    const list = [{ id: 'all', name: 'All', color: 'var(--paper)' }]
      .concat((site.categories || []).filter(c => counts[c.id]));
    $('#bins').innerHTML = list.map(c => {
      const n = c.id === 'all' ? works.length : counts[c.id];
      const sw = c.id === 'all' ? '' : '<span class="swatch"></span>';
      return `<button class="bin" type="button" data-cat="${esc(c.id)}" aria-pressed="${c.id === filter}" style="--c:${esc(c.color)}">${sw}${esc(c.name)} <span class="count">${n}</span></button>`;
    }).join('');

    $('#bins').onclick = e => {
      const b = e.target.closest('.bin');
      if (!b) return;
      filter = b.dataset.cat;
      document.querySelectorAll('.bin').forEach(x => x.setAttribute('aria-pressed', x === b));
      renderGrid();
    };
  }

  // Shown when a work has no thumbnail. Its look is chosen in Admin > Design.
  function posterHTML(w) {
    const c = cat(w.category);
    const meta = [c.name, w.duration, w.year].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
    return `<span class="poster"><span class="ph-slate" aria-hidden="true"></span><span class="ph-title">${esc(w.title)}</span><span class="ph-meta">${meta}</span></span>`;
  }

  function cardHTML(w) {
    const c = cat(w.category);
    const parsed = Media.parse(w.url);
    const fmt = Media.format(w, parsed, c);
    const th = Media.thumb(w, parsed);
    let media;
    if (th) media = `<img src="${esc(th)}" alt="" loading="lazy" decoding="async">`;
    else if (parsed.type === 'file') media = `<video src="${esc(parsed.src)}#t=0.5" muted playsinline preload="metadata" tabindex="-1"></video>`;
    else media = posterHTML(w);

    const verb = parsed.type === 'image' ? 'View' : 'Play';
    const dur = w.duration ? `<span class="card-dur">${esc(w.duration)}</span>` : '';
    return `<article class="card${fmt === 'landscape' ? ' wide' : ''}" style="--c:${esc(c.color)}">
      <button class="card-media" type="button" data-i="${works.indexOf(w)}" data-format="${esc(fmt)}" aria-label="${verb} ${esc(w.title)}">${media}${dur}<span class="card-play" aria-hidden="true">${PLAY_ICON}</span></button>
      <div class="card-body">
        <h3>${esc(w.title)}</h3>
        <p class="card-meta"><span class="swatch"></span><span>${esc(c.name)}</span>${w.year ? `<span>${esc(w.year)}</span>` : ''}</p>
      </div>
    </article>`;
  }

  function renderGrid() {
    const list = filter === 'all' ? works : works.filter(w => w.category === filter);
    const grid = $('#grid');
    grid.innerHTML = list.length
      ? list.map(cardHTML).join('')
      : '<p class="notice">No work here yet.</p>';
  }

  const grid = $('#grid');
  grid.addEventListener('click', e => {
    const btn = e.target.closest('.card-media');
    if (btn) openWork(works[+btn.dataset.i]);
  });
  // Broken thumbnail? Fall back to the title poster.
  grid.addEventListener('error', e => {
    if (e.target.tagName !== 'IMG') return;
    const btn = e.target.closest('.card-media');
    const w = btn && works[+btn.dataset.i];
    if (!w) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = posterHTML(w);
    e.target.replaceWith(tmp.firstChild);
  }, true);

  /* ---------------- Player ---------------- */

  function setupPlayer() {
    const dlg = $('#player');
    $('#playerClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { $('#playerMedia').innerHTML = ''; });
  }

  function openWork(w) {
    if (!w) return;
    const dlg = $('#player');
    const c = cat(w.category);
    const parsed = Media.parse(w.url);
    const fmt = Media.format(w, parsed, c);
    const media = $('#playerMedia');
    const title = esc(w.title);

    dlg.dataset.format = fmt;
    dlg.style.setProperty('--c', c.color);
    media.style.removeProperty('aspect-ratio');

    switch (parsed.type) {
      case 'youtube':
      case 'vimeo':
      case 'drive':
      case 'instagram':
        media.innerHTML = `<iframe src="${esc(parsed.embed)}" title="${title}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>`;
        break;
      case 'file': {
        const poster = w.thumbnail ? ` poster="${esc(Media.resolve(w.thumbnail))}"` : '';
        media.innerHTML = `<video src="${esc(parsed.src)}" controls autoplay playsinline${poster}></video>`;
        break;
      }
      case 'image':
        media.innerHTML = `<img src="${esc(parsed.src)}" alt="${title}">`;
        break;
      default: {
        const th = Media.thumb(w, parsed);
        const note = parsed.type === 'link'
          ? `This piece lives on ${esc(parsed.label)}. Use the button below to open it.`
          : 'No video link yet. Add one from the admin panel.';
        media.innerHTML = (th ? `<img src="${esc(th)}" alt="">` : posterHTML(w)) + `<p class="player-empty">${note}</p>`;
      }
    }

    const meta = [`<span class="swatch" style="--c:${esc(c.color)}"></span><span>${esc(c.name)}</span>`];
    if (w.year) meta.push(`<span>${esc(w.year)}</span>`);
    if (w.duration) meta.push(`<span>${esc(w.duration)}</span>`);
    $('#playerMeta').innerHTML = meta.join('');
    $('#playerTitle').textContent = w.title;
    $('#playerDesc').textContent = w.description || '';
    $('#playerTools').innerHTML = (w.tools || []).map(t => `<li>${esc(t)}</li>`).join('');

    const link = $('#playerLink');
    const external = parsed.href && ['youtube', 'vimeo', 'instagram', 'drive', 'link'].includes(parsed.type);
    link.hidden = !external;
    if (external) {
      link.href = parsed.href;
      link.textContent = `Open on ${parsed.label}`;
    }

    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  /* ---------------- Navigation ---------------- */

  function setupNav() {
    const bar = $('#topbar');
    const btn = $('#menuBtn');
    const set = open => {
      bar.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open);
      btn.textContent = open ? 'Close' : 'Menu';
    };
    btn.addEventListener('click', () => set(!bar.classList.contains('open')));
    $('#nav').addEventListener('click', e => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
  }
})();
