/*
  Media helpers shared by the site and the admin panel.
  Turns a pasted link into something we can embed and thumbnail.
  Supported: YouTube (incl. Shorts), Vimeo, Instagram reels/posts,
  Google Drive files, and direct video/image files (e.g. media/clip.mp4).
*/
window.Media = (() => {
  const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)$/i;
  const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;

  function resolve(path, base) {
    if (!path) return '';
    try { return new URL(path, base || document.baseURI).href; } catch (e) { return path; }
  }

  function youtube(id, vertical) {
    id = String(id).replace(/[^\w-]/g, '');
    return {
      type: 'youtube', id, label: 'YouTube', vertical,
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`,
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      href: vertical ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`
    };
  }

  function parse(url, base) {
    if (!url || !String(url).trim()) return { type: 'none', label: '' };
    let u;
    try { u = new URL(String(url).trim(), base || document.baseURI); }
    catch (e) { return { type: 'none', label: '' }; }

    const host = u.hostname.replace(/^(www|m)\./, '');
    const parts = u.pathname.split('/').filter(Boolean);

    if (host === 'youtu.be' && parts[0]) return youtube(parts[0], false);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'music.youtube.com') {
      if (parts[0] === 'shorts' && parts[1]) return youtube(parts[1], true);
      if ((parts[0] === 'embed' || parts[0] === 'live') && parts[1]) return youtube(parts[1], false);
      const v = u.searchParams.get('v');
      if (v) return youtube(v, false);
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = parts.find(p => /^\d+$/.test(p));
      if (id) return {
        type: 'vimeo', id, label: 'Vimeo', vertical: false,
        embed: `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0`,
        thumb: `https://vumbnail.com/${id}.jpg`,
        href: u.href
      };
    }

    if (host === 'instagram.com') {
      const i = parts.findIndex(p => ['reel', 'reels', 'p', 'tv'].includes(p));
      if (i > -1 && parts[i + 1]) {
        const kind = parts[i] === 'reels' ? 'reel' : parts[i];
        return {
          type: 'instagram', id: parts[i + 1], label: 'Instagram', vertical: true,
          embed: `https://www.instagram.com/${kind}/${parts[i + 1]}/embed/`,
          thumb: '',
          href: u.href
        };
      }
    }

    if (host === 'drive.google.com') {
      const i = parts.indexOf('d');
      const id = i > -1 ? parts[i + 1] : u.searchParams.get('id');
      if (id) return {
        type: 'drive', id, label: 'Google Drive', vertical: false,
        embed: `https://drive.google.com/file/d/${id}/preview`,
        thumb: `https://drive.google.com/thumbnail?id=${id}&sz=w1000`,
        href: `https://drive.google.com/file/d/${id}/view`
      };
    }

    if (VIDEO_EXT.test(u.pathname)) return { type: 'file', label: 'Video file', vertical: false, src: u.href, href: u.href };
    if (IMAGE_EXT.test(u.pathname)) return { type: 'image', label: 'Image', vertical: false, src: u.href, thumb: u.href, href: u.href };

    return { type: 'link', label: host || 'Link', vertical: false, href: u.href };
  }

  /* "1:45" -> 105, "1:02:03" -> 3723, 90 -> 90 */
  function seconds(d) {
    if (d == null || d === '') return 0;
    if (typeof d === 'number') return d;
    const p = String(d).trim().split(':').map(Number);
    if (p.some(n => Number.isNaN(n))) return 0;
    return p.reduce((acc, n) => acc * 60 + n, 0);
  }

  function format(work, parsed, category) {
    if (work.format && work.format !== 'auto') return work.format;
    if (parsed && parsed.vertical) return 'vertical';
    if (category && category.format) return category.format;
    return 'landscape';
  }

  function thumb(work, parsed, base) {
    if (work.thumbnail) return resolve(work.thumbnail, base);
    return (parsed && parsed.thumb) || '';
  }

  return { parse, resolve, seconds, format, thumb };
})();
