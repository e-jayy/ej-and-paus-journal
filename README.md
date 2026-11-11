# Our Notebook 📔

A shared, live notebook for two: draw, write, and stick in photos, GIFs and
videos. Built on [Excalidraw](https://excalidraw.com). You see each other's
cursors and edits as they happen.

- **Website**: GitHub Pages (free)
- **Login, saving, uploads and live sync**: Supabase (free plan)

Without Supabase keys it runs in **demo mode**: tabs in one browser sync with
each other, which is handy for testing.

---

## Setup (about 15 minutes)

### 1. Create the Supabase project
1. Sign up at <https://supabase.com> and click **New project**. Pick any name,
   generate a database password (you won't need it again), and choose the
   region closest to you.
2. When it's ready, open **SQL Editor → New query**.
3. Paste in all of [`supabase/setup.sql`](supabase/setup.sql). **Change the two
   example emails** to yours and hers, then click **Run**.
   - These two emails are the only ones that can open the notebook. Anyone else
     who signs up sees "Not on the guest list" and can't read anything.
4. Go to **Project Settings → API** (also labelled "Data API" / "API Keys") and
   copy the **Project URL** and the **anon / publishable key**.

### 2. Publish to GitHub Pages
The site lives at **https://e-jayy.github.io/paula-diary-website/** and is
served from the `gh-pages` branch.

1. Copy `.env.example` to `.env.local` and paste in your Supabase Project URL
   and anon key. `.env.local` is never committed.
2. Run:
   ```bash
   npm run deploy
   ```
   This builds the site with your keys and publishes it. The live site updates
   about a minute later. Run it again after any change.

> The repo also has an automatic deploy (`.github/workflows/deploy.yml`) that
> runs on every push. It only works while GitHub Actions is available on the
> account. If you use it, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
> under **Settings → Secrets and variables → Actions → Variables**, and set
> **Settings → Pages → Source** to **GitHub Actions**.

### 3. Create the two accounts
Signing in asks **"When is our anniversary?"**. Each person has their own
date, and the date picked decides who you're signed in as. Behind the scenes,
each person is a normal Supabase account whose password is built from their
date. That way the dates never appear in this (public) code.

For each person in `PEOPLE` in [`src/config.js`](src/config.js), open Supabase
**Authentication → Users → Add user → Create new user**:
- **Email**: the person's `email` from `config.js` (never actually emailed)
- **Password**: `our-anniversary-MM-DD` with their date, e.g. 3 March →
  `our-anniversary-03-03`
- Tick **Auto Confirm User**

Then add both emails to the guest list in **SQL Editor**:
```sql
insert into public.members (email) values
  ('paula@our-notebook.example.com'),
  ('ejay@our-notebook.example.com')
on conflict do nothing;
```

> **Security note:** there are only 366 possible dates, so a determined
> stranger could eventually guess one. Supabase slows them down. To make
> guessing slower still, lower **Authentication → Rate Limits → sign-ups and
> sign-ins**. Turn off **Authentication → Sign In / Providers → Allow new users
> to sign up**, since nobody needs to sign up any more.

---

## Personal touches
Edit [`src/config.js`](src/config.js) to change the title, her name, and the
birthday message that pops up the first time she opens it. Then run
`npm run deploy`.

## Using it
- **Pages**: the notebook is a series of two-page spreads. Use **‹ ›** at the
  bottom to turn pages; there's always one blank spread waiting at the end.
  Anything that runs off the paper is clipped at the edge, and photos, videos
  and text are kept fully on the page. Zoom in as far as you like. If the other
  person is on a different spread, a "… is on pages 5–6 →" button takes you there.
- **Draw / write**: the Excalidraw toolbar at the top (pen, text, shapes, arrows…).
- **Photos, GIFs, videos**: the **＋ Photo / video / GIF** button, the ☰ menu,
  drag-and-drop, or paste. Click a video once to use its play controls.
- **iPhone videos are shrunk automatically.** Before uploading, each video is
  converted in the browser to a 720p H.264 MP4. iPhone HEVC `.mov` files would
  otherwise be ~60–170 MB/min, and some Windows browsers can't play them. A
  1-minute clip ends up around 20 MB, and clips up to about 12 minutes fit
  (longer ones get lower quality). Keep the page open while it says
  "Preparing video".
- Photos and GIFs can be up to **50 MB** each. Supabase's free plan holds about
  **1 GB** in total: roughly 50 one-minute videos, or thousands of photos.
- **Who's here**: the green dot shows you're live; the other person's cursor
  shows up with their name.

## On an iPad
- **Make it an app:** open the site in Safari, tap **Share → Add to Home
  Screen**. It gets a notebook icon and opens full-screen, without Safari's
  address bar.
- **Apple Pencil:** the first time the Pencil touches the page, the notebook
  switches to pen mode. The Pencil draws, fingers scroll and pinch-zoom, and a
  resting palm won't leave marks. You can switch this off in the toolbar's
  pen-mode toggle.
- **Photos & videos:** the 📷 button opens the Photo Library or the camera.
  iPad photos are converted to JPEG automatically, and videos are shrunk
  before upload (see below).

## Running locally
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key (or skip for demo mode)
npm run dev
```
