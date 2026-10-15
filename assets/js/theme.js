/*
  Theme engine shared by the site and the admin panel.
  The design settings live in data/site.json under "theme".
  Theme.apply() turns them into CSS variables and data attributes.
*/
window.Theme = (() => {
  const SANS = '"Avenir Next", "Segoe UI", system-ui, -apple-system, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';

  // body: true means the font also reads well at paragraph size
  const FONTS = [
    { name: 'Bricolage Grotesque', q: 'Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800', kind: 'sans', body: true },
    { name: 'Instrument Sans', q: 'Instrument+Sans:wdth,wght@75..100,400..700', kind: 'sans', body: true },
    { name: 'Archivo', q: 'Archivo:wdth,wght@62..125,100..900', kind: 'sans', body: true },
    { name: 'Space Grotesk', q: 'Space+Grotesk:wght@300..700', kind: 'sans', body: true },
    { name: 'Sora', q: 'Sora:wght@100..800', kind: 'sans', body: true },
    { name: 'Manrope', q: 'Manrope:wght@200..800', kind: 'sans', body: true },
    { name: 'Outfit', q: 'Outfit:wght@100..900', kind: 'sans', body: true },
    { name: 'Syne', q: 'Syne:wght@400..800', kind: 'sans', body: false },
    { name: 'Unbounded', q: 'Unbounded:wght@200..900', kind: 'sans', body: false },
    { name: 'Oswald', q: 'Oswald:wght@200..700', kind: 'sans', body: false },
    { name: 'Fraunces', q: 'Fraunces:opsz,wght@9..144,100..900', kind: 'serif', body: true },
    { name: 'Newsreader', q: 'Newsreader:opsz,wght@6..72,200..800', kind: 'serif', body: true },
    { name: 'Playfair Display', q: 'Playfair+Display:wght@400..900', kind: 'serif', body: false }
  ];

  const PRESETS = {
    suite:    { label: 'Edit suite', colors: { bg: '#1D1B24', surface: '#27242F', text: '#F0ECF6', muted: '#ABA4BA', accent: '#FF5545' } },
    grade:    { label: 'Teal grade', colors: { bg: '#0F1F1E', surface: '#16302D', text: '#E6F4F1', muted: '#93B3AC', accent: '#FF8A4C' } },
    midnight: { label: 'Midnight', colors: { bg: '#0E1525', surface: '#162038', text: '#E8EEF8', muted: '#9AA8C2', accent: '#FFB547' } },
    film:     { label: 'Film stock', colors: { bg: '#1C1814', surface: '#28221C', text: '#F3EADF', muted: '#B6A894', accent: '#FF6B3D' } },
    mono:     { label: 'Mono', colors: { bg: '#111111', surface: '#1C1C1C', text: '#FFFFFF', muted: '#A3A3A3', accent: '#FFFFFF' } },
    daylight: { label: 'Daylight', colors: { bg: '#F2F1F6', surface: '#FFFFFF', text: '#1D1B24', muted: '#5D5870', accent: '#E0352A' } }
  };

  const SECTION_IDS = ['work', 'about', 'contact'];
  const SECTION_NAMES = { work: 'Work', about: 'About', contact: 'Contact' };
  const PLACEHOLDERS = ['title', 'slate', 'plain', 'image'];
  const HEX = /^#[0-9a-f]{6}$/i;

  const DEFAULT = {
    headingFont: 'Bricolage Grotesque',
    bodyFont: 'Bricolage Grotesque',
    preset: 'suite',
    colors: { ...PRESETS.suite.colors },
    heroAlign: 'left',
    headingAlign: 'left',
    nameSize: 100,
    headingSize: 100,
    bodySize: 17,
    sections: SECTION_IDS.map(id => ({ id, show: true })),
    timeline: true,
    gridLayout: 'masonry',
    gridColumns: 3,
    uniformShape: 'landscape',
    placeholder: { style: 'title', showTitle: true, image: '' }
  };

  const clone = o => JSON.parse(JSON.stringify(o));
  const inRange = (v, lo, hi) => typeof v === 'number' && v >= lo && v <= hi;

  function normalize(input) {
    const t = input && typeof input === 'object' ? input : {};
    const out = clone(DEFAULT);
    const pick = (k, ok) => { if (t[k] !== undefined && ok(t[k])) out[k] = t[k]; };
    const isFont = v => FONTS.some(f => f.name === v);

    pick('headingFont', isFont);
    pick('bodyFont', isFont);
    pick('preset', v => typeof v === 'string');
    if (t.colors && typeof t.colors === 'object') {
      Object.keys(out.colors).forEach(k => { if (HEX.test(t.colors[k] || '')) out.colors[k] = t.colors[k]; });
    }
    pick('heroAlign', v => v === 'left' || v === 'center');
    pick('headingAlign', v => v === 'left' || v === 'center');
    pick('nameSize', v => inRange(v, 50, 160));
    pick('headingSize', v => inRange(v, 60, 150));
    pick('bodySize', v => inRange(v, 14, 22));
    pick('timeline', v => typeof v === 'boolean');
    pick('gridLayout', v => v === 'masonry' || v === 'uniform');
    pick('gridColumns', v => [2, 3, 4].includes(v));
    pick('uniformShape', v => ['landscape', 'portrait', 'square'].includes(v));

    if (Array.isArray(t.sections)) {
      const seen = new Set();
      const list = [];
      t.sections.forEach(s => {
        if (s && SECTION_IDS.includes(s.id) && !seen.has(s.id)) {
          seen.add(s.id);
          list.push({ id: s.id, show: s.show !== false });
        }
      });
      SECTION_IDS.forEach(id => { if (!seen.has(id)) list.push({ id, show: true }); });
      out.sections = list;
    }

    const ph = t.placeholder || {};
    if (PLACEHOLDERS.includes(ph.style)) out.placeholder.style = ph.style;
    if (typeof ph.showTitle === 'boolean') out.placeholder.showTitle = ph.showTitle;
    if (typeof ph.image === 'string') out.placeholder.image = ph.image;
    return out;
  }

  function font(name) { return FONTS.find(f => f.name === name) || FONTS[0]; }
  function stack(name) { const f = font(name); return `"${f.name}", ${f.kind === 'serif' ? SERIF : SANS}`; }
  function fontsURL(names) {
    const qs = [...new Set(names)].map(n => 'family=' + font(n).q).join('&');
    return `https://fonts.googleapis.com/css2?${qs}&display=swap`;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }

  function apply(input, doc = document) {
    const t = normalize(input);
    const root = doc.documentElement;
    const set = (k, v) => root.style.setProperty(k, v);
    const c = t.colors;

    set('--suite', c.bg);
    set('--panel', c.surface);
    set('--paper', c.text);
    set('--muted', c.muted);
    set('--playhead', c.accent);
    set('--font-head', stack(t.headingFont));
    set('--font-body', stack(t.bodyFont));
    set('--name-scale', t.nameSize / 100);
    set('--head-scale', t.headingSize / 100);
    set('--body-size', (t.bodySize / 16) + 'rem');
    set('--cols', t.gridColumns);
    let img = '';
    if (t.placeholder.image) {
      try { img = new URL(t.placeholder.image, doc.baseURI).href; } catch (e) { img = ''; }
    }
    set('--ph-img', img ? `url("${img.replace(/"/g, '%22')}")` : 'none');
    root.style.colorScheme = luminance(c.bg) < 0.4 ? 'dark' : 'light';

    root.dataset.heroAlign = t.heroAlign;
    root.dataset.headAlign = t.headingAlign;
    root.dataset.grid = t.gridLayout;
    root.dataset.uni = t.uniformShape;
    root.dataset.timeline = t.timeline ? 'on' : 'off';
    root.dataset.ph = t.placeholder.style;
    root.dataset.phTitle = t.placeholder.showTitle ? 'on' : 'off';

    // Fonts
    let link = doc.getElementById('theme-fonts');
    if (!link) {
      link = doc.createElement('link');
      link.id = 'theme-fonts';
      link.rel = 'stylesheet';
      doc.head.appendChild(link);
    }
    const href = fontsURL([t.headingFont, t.bodyFont]);
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);

    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = c.bg;

    // Section order and visibility (nav follows the same order)
    const main = doc.querySelector('main');
    const nav = doc.getElementById('nav');
    t.sections.forEach(s => {
      const el = doc.getElementById(s.id);
      if (el && main) { main.appendChild(el); el.hidden = !s.show; }
      const a = nav && nav.querySelector(`a[href="#${s.id}"]`);
      if (a) { nav.appendChild(a); a.hidden = !s.show; }
    });
    doc.querySelectorAll('.hero-cta a[href^="#"]').forEach(a => {
      const s = t.sections.find(x => '#' + x.id === a.getAttribute('href'));
      if (s) a.hidden = !s.show;
    });
    return t;
  }

  return { FONTS, PRESETS, SECTION_NAMES, DEFAULT, normalize, apply, stack, fontsURL, contrast, luminance, clone };
})();
