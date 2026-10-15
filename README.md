# Portfolio site

A portfolio for video edits, reels and AI content. It runs free on GitHub Pages and comes with an admin panel at `/admin` for adding new work from your phone or computer, with no server needed.

## What's inside

```
index.html            The portfolio page
assets/css/style.css  All styling (colors at the top)
assets/js/main.js     Builds the timeline, grid and player
assets/js/media.js    Understands YouTube, Vimeo, Instagram, Drive and file links
assets/js/theme.js    Fonts, colors and layout options from the Design tab
data/site.json        Your name, bio, contact, categories
data/works.json       Your work list
admin/                The admin panel
media/                Files you upload through the admin panel
.nojekyll             Tells GitHub Pages to serve files as they are
```

## 1. Put it on GitHub Pages

1. Create a GitHub account if you don't have one.
2. Create a new **public** repository.
   - Name it `yourusername.github.io` to get the address `https://yourusername.github.io/`.
   - Or give it any name, such as `portfolio`, to get `https://yourusername.github.io/portfolio/`.
3. In the repository, choose **Add file → Upload files**, drag in **everything inside this folder** (including the `.nojekyll` file, `admin`, `assets`, `data` and `media` folders), and commit.
   - If your computer hides `.nojekyll`, the site still works. It just builds a little slower.
4. Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, pick **main** and **/ (root)**, then save.
5. After a minute or two, your site is live at the address above.

## 2. Connect the admin panel

1. Open `https://yourusername.github.io/admin/` (or `/portfolio/admin/`).
2. Create an access token:
   - GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - **Repository access:** Only select repositories → your portfolio repo
   - **Permissions → Repository permissions → Contents:** Read and write
   - Generate it and copy it. GitHub only shows it once.
3. Paste your username, repository name, branch (`main`) and token, then choose **Connect**.

The token is stored only in that browser. Anyone else who opens `/admin` sees an empty connect screen and can't change anything. Use **Sign out** on shared computers. If your token expires, make a new one and connect again.

## 3. Add new work

In the admin panel, choose **Add work**, fill in the details, choose **Save work**, then **Publish changes**. Your site updates about a minute later.

**Where to keep your videos.** GitHub isn't built for video hosting, so for most work, upload the video to one of these and paste the link:

| Where | Notes |
|---|---|
| YouTube / YouTube Shorts | Best option. Plays on your site, thumbnail added automatically. Unlisted videos work too. |
| Vimeo | Plays on your site, thumbnail added automatically. |
| Instagram reel or post | Plays on your site. Add a thumbnail yourself, since Instagram doesn't share one. |
| Google Drive | Set sharing to **Anyone with the link**. Thumbnail added automatically. |

**Uploading files directly** works for short clips and images (up to 50 MB each). They go into the `media/` folder of your repository. Keep the total under about 1 GB, which is GitHub Pages' size limit. AI images are a good fit for this.

**Tips**
- Items at the top of the list appear first on your site. Use the arrows to reorder.
- **On timeline** puts a piece on the editing timeline at the top of the page. Five or six pieces looks best.
- **Duration** (like `0:45`) sets each clip's length on the timeline and shows on the card.
- Categories (name, color, timeline track, default shape) are edited in the **Profile** tab.

## 4. Change the design

Open the **Design** tab in the admin panel. A live preview of your real site sits beside the controls, so every change shows up instantly. Nothing goes live until you choose **Publish design**.

- **Fonts:** pick one font for your name and headings and one for body text, from 13 fonts suited to creative portfolios.
- **Colors:** start from a preset (Edit suite, Teal grade, Midnight, Film stock, Mono, Daylight), then fine-tune the background, panels, text, secondary text and accent. A readability check warns you if text gets hard to read.
- **Text:** align your name and intro left or centered, align the Work and Contact titles, and adjust the name size, section title size and body text size.
- **Sections and layout:** reorder or hide Work, About and Contact (the menu follows), turn the timeline on or off, choose a masonry grid (each video keeps its shape) or an even grid (every card the same shape), and set 2–4 columns.
- **Video placeholder:** choose how work without a thumbnail looks: color and title, a film slate, color only, or your own uploaded image.

**Reset to default** brings back the original design. Your design settings are stored in `data/site.json` under `"theme"`.

## Editing by hand (optional)

You can also edit `data/works.json` directly on GitHub. Each work looks like this:

```json
{
  "id": "any-unique-text",
  "title": "Product launch reel",
  "category": "reel",
  "url": "https://www.youtube.com/shorts/VIDEO_ID",
  "thumbnail": "",
  "format": "vertical",
  "duration": "0:45",
  "year": 2026,
  "tools": ["Premiere Pro", "After Effects"],
  "description": "What you did and for whom.",
  "featured": true
}
```

`category` must match an `id` in `data/site.json`. `format` can be `landscape`, `vertical` or `square`; leave it out to decide automatically. Only `title` and `category` are required.

## Preview on your computer

Browsers block the data files when you double-click `index.html`, so run a tiny local server from this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Changing the look in code

Most design changes are easiest in **Admin → Design**. For deeper changes, the base styles live in `assets/css/style.css` and the font list and color presets live in `assets/js/theme.js`.

## Custom domain (optional)

Buy a domain, then follow GitHub's guide under **Settings → Pages → Custom domain**. Everything keeps working, including the admin panel.
