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

### 3. Point Supabase's emails at the site
In Supabase, open **Authentication → URL Configuration**:
- **Site URL**: `https://e-jayy.github.io/paula-diary-website/`
- **Redirect URLs**: add the same address.

That way the "confirm your email" link sends you back to the notebook.

### 4. Create both accounts
Open the site, choose **First time here? Create an account**, confirm the email,
then sign in. Do this for both of you (you can make hers ahead of time, or let
her do it).

> **Tip:** once both accounts exist, you can turn off **Authentication →
> Providers → Email → Allow new users to sign up**. It isn't required, since
> strangers can't see anything anyway.

---

## Personal touches
Edit [`src/config.js`](src/config.js) to change the title, her name, and the
birthday message that pops up the first time she opens it. Then run
`npm run deploy`.

## Using it
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
