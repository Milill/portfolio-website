/*
  Portfolio admin.
  Uses the GitHub Contents API to read and write data/works.json,
  data/site.json and files in media/. No server needed.
  The access token is kept in this browser's localStorage only.
*/
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'portfolio-admin';
  const SITE_BASE = new URL('../', location.href).href;
  const MAX_MB = 50;
  const MAX_THUMB_MB = 10;

  const DEFAULT_CATS = [
    { id: 'edit', name: 'Video editing', color: '#9B8CFF', track: 'V1', format: 'landscape', blurb: '' },
    { id: 'reel', name: 'Reels', color: '#FFB547', track: 'V1', format: 'vertical', blurb: '' },
    { id: 'ai', name: 'AI content', color: '#3CC9B9', track: 'V2', format: 'landscape', blurb: '' },
    { id: 'other', name: 'Other', color: '#FF7A9A', track: 'V1', format: 'landscape', blurb: '' }
  ];

  const state = {
    cfg: null,
    site: null,
    works: [],
    sha: {},
    savedWorks: '[]',
    editing: -1
  };

  /* ---------------- Helpers ---------------- */

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 48) || 'work';
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  const splitList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const catOf = id => (state.site.categories || []).find(c => c.id === id) || { id, name: id || 'Other', color: '#ABA4BA' };

  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  function fileToB64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  let toastTimer;
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', !!isError);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 7000 : 4500);
  }

  function explain(e) {
    if (e instanceof SyntaxError) return `A data file on GitHub isn't valid JSON (${e.message}). Fix it on GitHub, then reconnect.`;
    if (e instanceof TypeError && !e.status) return "Couldn't reach GitHub. Check your internet connection and try again.";
    switch (e.status) {
      case 401: return 'GitHub rejected the token. It may have expired. Create a new one and connect again.';
      case 403: return 'This token can’t write to the repository. Give it “Contents: Read and write” permission.';
      case 404: return 'Repository or branch not found. Check the username, repository name and branch, and that the token can access this repository.';
      case 409: return 'The file changed on GitHub while you were editing. Reload this page and try again.';
      case 413: return 'That file is too large for GitHub. Upload it to YouTube or Google Drive and paste the link instead.';
      case 422: return (e.data && e.data.message) || 'GitHub couldn’t save the file.';
      default: return e.message || 'Something went wrong talking to GitHub. Try again.';
    }
  }

  /* ---------------- GitHub API ---------------- */

  async function gh(path, opts = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${state.cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const res = await fetch(`https://api.github.com${path}`, { ...opts, headers });
    if (!res.ok) {
      const err = new Error(`GitHub returned ${res.status}`);
      err.status = res.status;
      try { err.data = await res.json(); } catch (e) { /* no body */ }
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  const repoPath = () => `/repos/${encodeURIComponent(state.cfg.owner)}/${encodeURIComponent(state.cfg.repo)}`;

  async function getFile(path) {
    try {
      const d = await gh(`${repoPath()}/contents/${encPath(path)}?ref=${encodeURIComponent(state.cfg.branch)}`);
      state.sha[path] = d.sha;
      return { sha: d.sha, text: b64decode(d.content || '') };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  function putFile(path, content, message, sha) {
    const body = { message, content, branch: state.cfg.branch };
    if (sha) body.sha = sha;
    return gh(`${repoPath()}/contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  async function saveJSON(path, obj, message) {
    const content = b64encode(JSON.stringify(obj, null, 2) + '\n');
    try {
      const r = await putFile(path, content, message, state.sha[path]);
      state.sha[path] = r.content.sha;
    } catch (e) {
      // File changed elsewhere or sha missing: refresh sha and retry once.
      if (e.status === 409 || e.status === 422) {
        await getFile(path);
        const r = await putFile(path, content, message, state.sha[path]);
        state.sha[path] = r.content.sha;
      } else {
        throw e;
      }
    }
  }

  async function uploadFile(file, dir, name) {
    const ext = ((file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'bin').toLowerCase();
    const path = `${dir}/${slug(name)}-${Date.now().toString(36)}.${ext}`;
    const content = await fileToB64(file);
    await putFile(path, content, `Upload ${file.name}`);
    return path;
  }

  /* ---------------- Connect ---------------- */

  function guessRepo() {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return {};
    const parts = location.pathname.split('/').filter(Boolean);
    const i = parts.lastIndexOf('admin');
    const before = i > -1 ? parts.slice(0, i) : [];
    return { owner: m[1], repo: before[0] || `${m[1]}.github.io` };
  }

  function showConnect(cfg) {
    $('#app').hidden = true;
    $('#topRight').hidden = true;
    $('#connect').hidden = false;
    const f = $('#connectForm');
    const g = { ...guessRepo(), ...(cfg || {}) };
    if (g.owner) f.owner.value = g.owner;
    if (g.repo) f.repo.value = g.repo;
    if (g.branch) f.branch.value = g.branch;
    if (g.token) f.token.value = g.token;
  }

  async function connect(cfg) {
    state.cfg = cfg;
    const btn = $('#connectBtn');
    btn.disabled = true;
    btn.textContent = 'Connecting…';
    $('#connectError').textContent = '';
    try {
      await gh(`${repoPath()}/branches/${encodeURIComponent(cfg.branch)}`);
      const [w, s] = await Promise.all([getFile('data/works.json'), getFile('data/site.json')]);
      const worksData = w ? JSON.parse(w.text) : { works: [] };
      state.works = (worksData.works || []).map(x => ({ id: x.id || uid(), ...x }));
      state.site = s ? JSON.parse(s.text) : { name: 'Your Name' };
      if (!Array.isArray(state.site.categories) || !state.site.categories.length) state.site.categories = DEFAULT_CATS;
      state.savedWorks = JSON.stringify(state.works);
      localStorage.setItem(KEY, JSON.stringify(cfg));
      showApp();
    } catch (e) {
      console.error(e);
      showConnect(cfg);
      $('#connectError').textContent = explain(e);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Connect';
    }
  }

  function showApp() {
    const { owner, repo } = state.cfg;
    $('#connect').hidden = true;
    $('#app').hidden = false;
    $('#topRight').hidden = false;
    $('#repoLabel').textContent = `${owner}/${repo}`;
    const isUserSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
    $('#viewSite').href = location.hostname.endsWith('github.io')
      ? SITE_BASE
      : `https://${owner}.github.io/${isUserSite ? '' : repo + '/'}`;
    renderList();
    fillProfile();
  }

  /* ---------------- Works list ---------------- */

  function thumbFor(w) {
    const parsed = Media.parse(w.url, SITE_BASE);
    return Media.thumb(w, parsed, SITE_BASE);
  }

  function renderList() {
    const ul = $('#workList');
    if (!state.works.length) {
      ul.innerHTML = '<li class="wempty">No work yet. Add your first piece, then publish it to show it on your site.</li>';
    } else {
      ul.innerHTML = state.works.map((w, i) => {
        const c = catOf(w.category);
        const th = thumbFor(w);
        const last = i === state.works.length - 1;
        return `<li class="witem" style="--c:${esc(c.color)}">
          <div class="wthumb">${th ? `<img src="${esc(th)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</div>
          <div class="wtext">
            <strong>${esc(w.title)}</strong>
            <span class="wmeta"><span>${esc(c.name)}</span>${w.year ? `<span>${esc(w.year)}</span>` : ''}${w.url ? '' : '<span>No link yet</span>'}</span>
          </div>
          <div class="wactions">
            <button class="btn btn-small feat" type="button" data-act="feature" data-i="${i}" aria-pressed="${!!w.featured}">On timeline</button>
            <button class="icon-btn" type="button" data-act="up" data-i="${i}" aria-label="Move ${esc(w.title)} up" ${i === 0 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="icon-btn" type="button" data-act="down" data-i="${i}" aria-label="Move ${esc(w.title)} down" ${last ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <button class="btn btn-small" type="button" data-act="edit" data-i="${i}">Edit</button>
            <button class="btn btn-small btn-danger" type="button" data-act="delete" data-i="${i}">Delete</button>
          </div>
        </li>`;
      }).join('');
    }
    updateDirty();
  }

  function isDirty() { return JSON.stringify(state.works) !== state.savedWorks; }

  function updateDirty() {
    const d = isDirty();
    const el = $('#dirty');
    el.textContent = d ? 'Unpublished changes' : 'All changes published';
    el.classList.toggle('pending', d);
    $('#publishWorks').disabled = !d;
  }

  $('#workList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = +b.dataset.i;
    const list = state.works;
    switch (b.dataset.act) {
      case 'feature': list[i].featured = !list[i].featured; break;
      case 'up': if (i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]]; break;
      case 'down': if (i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]]; break;
      case 'edit': openWorkDialog(i); return;
      case 'delete':
        if (!confirm(`Delete “${list[i].title}”? It disappears from your site after you publish.`)) return;
        list.splice(i, 1);
        break;
    }
    renderList();
    // keep focus on the moved item’s button for keyboard users
    const again = $(`#workList [data-act="${b.dataset.act}"][data-i="${b.dataset.act === 'up' ? i - 1 : b.dataset.act === 'down' ? i + 1 : i}"]`);
    if (again && !again.disabled) again.focus();
  });

  $('#publishWorks').addEventListener('click', async () => {
    const btn = $('#publishWorks');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const today = new Date().toISOString().slice(0, 10);
      await saveJSON('data/works.json', { updated: today, works: state.works }, 'Update portfolio works');
      state.savedWorks = JSON.stringify(state.works);
      toast('Published. Your site updates in about a minute.');
    } catch (e) {
      console.error(e);
      toast(explain(e), true);
    } finally {
      btn.textContent = 'Publish changes';
      updateDirty();
    }
  });

  /* ---------------- Add / edit dialog ---------------- */

  const dlg = $('#workDialog');
  const wf = $('#workForm');

  function setSource(mode) {
    wf.querySelector(`input[name="source"][value="${mode}"]`).checked = true;
    $('#srcLink').hidden = mode !== 'link';
    $('#srcUpload').hidden = mode !== 'upload';
  }

  function openWorkDialog(i) {
    state.editing = i;
    const w = i > -1 ? state.works[i] : {};
    wf.reset();
    $('#workStatus').textContent = '';
    $('#workDialogTitle').textContent = i > -1 ? 'Edit work' : 'Add work';
    $('#categorySelect').innerHTML = state.site.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

    wf.title.value = w.title || '';
    wf.category.value = w.category || state.site.categories[0].id;
    wf.format.value = w.format || 'auto';
    wf.thumbUrl.value = w.thumbnail || '';
    wf.duration.value = w.duration || '';
    wf.year.value = w.year || (i > -1 ? '' : new Date().getFullYear());
    wf.tools.value = (w.tools || []).join(', ');
    wf.description.value = w.description || '';
    wf.featured.checked = !!w.featured;

    const uploaded = w.url && !/^https?:\/\//i.test(w.url);
    setSource(uploaded ? 'upload' : 'link');
    wf.url.value = uploaded ? '' : (w.url || '');
    $('#uploadHint').textContent = uploaded
      ? `Current file: ${w.url}. Choose a new file only if you want to replace it.`
      : `MP4 or image, up to ${MAX_MB} MB. For longer videos, upload to YouTube or Google Drive and paste the link instead.`;
    detect();
    dlg.showModal();
    wf.title.focus();
  }

  function detect() {
    const box = $('#detect');
    const url = wf.url.value.trim();
    if (!url) { box.hidden = true; return; }
    const parsed = Media.parse(/^https?:\/\//i.test(url) ? url : 'https://' + url, SITE_BASE);
    const thumb = wf.thumbUrl.value.trim() ? Media.resolve(wf.thumbUrl.value.trim(), SITE_BASE) : parsed.thumb;
    const img = $('#detectImg');
    img.onerror = () => { img.hidden = true; };
    img.hidden = !thumb;
    if (thumb) img.src = thumb;
    let msg;
    if (parsed.type === 'link') msg = `<strong>Link</strong> This opens in a new tab. Videos embed for YouTube, Vimeo, Instagram, Google Drive and video files.`;
    else if (parsed.type === 'instagram') msg = `<strong>Instagram ${parsed.vertical ? 'reel' : 'post'}</strong> Instagram doesn't share thumbnails, so add one below for the grid.`;
    else if (parsed.type === 'drive') msg = `<strong>Google Drive</strong> Make sure sharing is set to “Anyone with the link”.`;
    else if (parsed.type === 'none') msg = `<strong>Not a link</strong> Check the address.`;
    else msg = `<strong>${esc(parsed.label)}${parsed.vertical ? ' (vertical)' : ''}</strong> Plays right on your site.`;
    $('#detectText').innerHTML = msg;
    box.hidden = false;
  }

  wf.url.addEventListener('input', detect);
  wf.thumbUrl.addEventListener('input', detect);
  wf.addEventListener('change', e => { if (e.target.name === 'source') setSource(e.target.value); });
  $('#addWork').addEventListener('click', () => openWorkDialog(-1));
  $('#closeWork').addEventListener('click', () => dlg.close());
  $('#cancelWork').addEventListener('click', () => dlg.close());

  wf.addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('#workStatus');
    const saveBtn = $('#saveWork');
    const title = wf.title.value.trim();
    if (!title) { status.textContent = 'Add a title.'; wf.title.focus(); return; }

    const existing = state.editing > -1 ? state.works[state.editing] : null;
    const source = wf.source.value;
    let url = '';

    saveBtn.disabled = true;
    try {
      if (source === 'upload') {
        const file = wf.file.files[0];
        if (file) {
          if (file.size > MAX_MB * 1024 * 1024) throw new Error(`That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is ${MAX_MB} MB, so upload it to YouTube or Google Drive and paste the link instead.`);
          status.textContent = `Uploading ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`;
          url = await uploadFile(file, 'media', title);
        } else if (existing && existing.url && !/^https?:\/\//i.test(existing.url)) {
          url = existing.url;
        } else {
          throw new Error('Choose a file to upload, or switch to “Paste a link”.');
        }
      } else {
        url = wf.url.value.trim();
        if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      }

      let thumbnail = wf.thumbUrl.value.trim();
      const tf = wf.thumbFile.files[0];
      if (tf) {
        if (tf.size > MAX_THUMB_MB * 1024 * 1024) throw new Error(`Thumbnails can be up to ${MAX_THUMB_MB} MB.`);
        status.textContent = 'Uploading thumbnail…';
        thumbnail = await uploadFile(tf, 'media/thumbs', title);
      }

      const work = {
        id: existing ? existing.id : uid(),
        title,
        category: wf.category.value,
        url,
        thumbnail,
        format: wf.format.value === 'auto' ? '' : wf.format.value,
        duration: wf.duration.value.trim(),
        year: wf.year.value ? Number(wf.year.value) : '',
        tools: splitList(wf.tools.value),
        description: wf.description.value.trim(),
        featured: wf.featured.checked
      };
      // Drop empty fields to keep works.json tidy
      Object.keys(work).forEach(k => {
        const v = work[k];
        if (v === '' || (Array.isArray(v) && !v.length) || v === false) delete work[k];
      });

      if (existing) state.works[state.editing] = work;
      else state.works.unshift(work);

      dlg.close();
      renderList();
      toast(existing ? 'Changes saved. Publish to update your site.' : 'Work added. Publish to put it on your site.');
    } catch (err) {
      console.error(err);
      status.textContent = err.status ? explain(err) : err.message;
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ---------------- Profile ---------------- */

  const pf = $('#profileForm');

  function catRow(c) {
    const used = state.works.filter(w => w.category === c.id).length;
    return `<div class="cat-row" data-id="${esc(c.id || '')}">
      <input type="color" class="c-color" value="${esc(c.color || '#ABA4BA')}" aria-label="Color">
      <input type="text" class="c-name" value="${esc(c.name || '')}" aria-label="Name" placeholder="Name">
      <select class="c-track" aria-label="Timeline track"><option value="V1"${c.track !== 'V2' ? ' selected' : ''}>V1</option><option value="V2"${c.track === 'V2' ? ' selected' : ''}>V2</option></select>
      <select class="c-format" aria-label="Default shape">
        ${['landscape', 'vertical', 'square'].map(f => `<option value="${f}"${(c.format || 'landscape') === f ? ' selected' : ''}>${f[0].toUpperCase() + f.slice(1)}</option>`).join('')}
      </select>
      <input type="text" class="c-blurb" value="${esc(c.blurb || '')}" aria-label="Short description" placeholder="Short description">
      <button class="icon-btn c-remove" type="button" aria-label="Remove ${esc(c.name || 'category')}" data-used="${used}">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    </div>`;
  }

  function fillProfile() {
    const s = state.site;
    ['name', 'role', 'intro', 'location', 'availability', 'photo', 'email', 'contactNote'].forEach(k => { pf[k].value = s[k] || ''; });
    pf.bio.value = Array.isArray(s.bio) ? s.bio.join('\n\n') : (s.bio || '');
    pf.tools.value = (s.tools || []).join(', ');
    pf.socials.value = (s.socials || []).map(x => `${x.label}, ${x.url}`).join('\n');
    $('#catRows').innerHTML = s.categories.map(catRow).join('');
  }

  $('#addCat').addEventListener('click', () => {
    $('#catRows').insertAdjacentHTML('beforeend', catRow({ color: '#7FB3FF', track: 'V1', format: 'landscape' }));
    $('#catRows .cat-row:last-child .c-name').focus();
  });

  $('#catRows').addEventListener('click', e => {
    const b = e.target.closest('.c-remove');
    if (!b) return;
    const n = +b.dataset.used;
    if (n) {
      toast(`${n} piece${n > 1 ? 's use' : ' uses'} this category. Move ${n > 1 ? 'them' : 'it'} to another category first.`, true);
      return;
    }
    if ($('#catRows').children.length <= 1) { toast('Keep at least one category.', true); return; }
    b.closest('.cat-row').remove();
  });

  pf.addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('#profileStatus');
    const btn = $('#publishProfile');
    if (!pf.name.value.trim()) { status.textContent = 'Add your name.'; pf.name.focus(); return; }

    const taken = new Set();
    const categories = [...document.querySelectorAll('#catRows .cat-row')].map(row => {
      const name = row.querySelector('.c-name').value.trim();
      if (!name) return null;
      let id = row.dataset.id || slug(name);
      while (taken.has(id)) id += '-2';
      taken.add(id);
      const c = {
        id,
        name,
        color: row.querySelector('.c-color').value,
        track: row.querySelector('.c-track').value,
        format: row.querySelector('.c-format').value
      };
      const blurb = row.querySelector('.c-blurb').value.trim();
      if (blurb) c.blurb = blurb;
      return c;
    }).filter(Boolean);
    if (!categories.length) { status.textContent = 'Add at least one category.'; return; }

    btn.disabled = true;
    try {
      let photo = pf.photo.value.trim();
      const pfile = pf.photoFile.files[0];
      if (pfile) {
        if (pfile.size > MAX_THUMB_MB * 1024 * 1024) throw new Error(`Photos can be up to ${MAX_THUMB_MB} MB.`);
        status.textContent = 'Uploading photo…';
        photo = await uploadFile(pfile, 'media', 'profile');
      }

      const site = {
        ...state.site,
        name: pf.name.value.trim(),
        role: pf.role.value.trim(),
        intro: pf.intro.value.trim(),
        location: pf.location.value.trim(),
        availability: pf.availability.value.trim(),
        photo,
        bio: pf.bio.value.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean),
        email: pf.email.value.trim(),
        contactNote: pf.contactNote.value.trim(),
        socials: pf.socials.value.split('\n').map(line => {
          const i = line.indexOf(',');
          if (i < 0) return null;
          const label = line.slice(0, i).trim();
          let url = line.slice(i + 1).trim();
          if (!label || !url) return null;
          if (!/^(https?:|mailto:|tel:)/i.test(url)) url = 'https://' + url;
          return { label, url };
        }).filter(Boolean),
        tools: splitList(pf.tools.value),
        categories
      };

      status.textContent = 'Publishing…';
      await saveJSON('data/site.json', site, 'Update portfolio profile');
      state.site = site;
      pf.photoFile.value = '';
      fillProfile();
      renderList();
      status.textContent = '';
      toast('Profile published. Your site updates in about a minute.');
    } catch (err) {
      console.error(err);
      status.textContent = err.status || err instanceof TypeError ? explain(err) : err.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Tabs, sign out, boot ---------------- */

  function selectTab(which) {
    const works = which === 'works';
    $('#tabWorks').setAttribute('aria-selected', works);
    $('#tabProfile').setAttribute('aria-selected', !works);
    $('#panelWorks').hidden = !works;
    $('#panelProfile').hidden = works;
  }
  $('#tabWorks').addEventListener('click', () => selectTab('works'));
  $('#tabProfile').addEventListener('click', () => selectTab('profile'));

  $('#signOut').addEventListener('click', () => {
    if (isDirty() && !confirm('You have unpublished changes. Sign out anyway?')) return;
    localStorage.removeItem(KEY);
    state.savedWorks = JSON.stringify(state.works);
    location.reload();
  });

  window.addEventListener('beforeunload', e => {
    if (state.cfg && state.site && isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  $('#connectForm').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const cfg = {
      owner: f.owner.value.trim(),
      repo: f.repo.value.trim(),
      branch: f.branch.value.trim() || 'main',
      token: f.token.value.trim()
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) {
      $('#connectError').textContent = 'Fill in your username, repository name and access token.';
      return;
    }
    connect(cfg);
  });

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
  if (saved && saved.token) {
    showConnect(saved);
    connect(saved);
  } else {
    showConnect();
  }
})();
