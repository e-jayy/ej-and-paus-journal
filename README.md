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

### 2. Put it on GitHub Pages
1. Push this folder to a GitHub repository. On a free GitHub account, Pages
   needs the repo to be **public**. That's fine: the code contains no secrets,
   and all the notebook content stays in Supabase behind the login.
2. In the repo, open **Settings → Secrets and variables → Actions → Variables**
   and add two **repository variables**:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open **Actions → Deploy to GitHub Pages → Run workflow** (it also runs on
   every push to `main`). A few minutes later the site is live at
   `https://<your-username>.github.io/<repo-name>/`.

### 3. Point Supabase's emails at the site
In Supabase, open **Authentication → URL Configuration**:
- **Site URL**: `https://<your-username>.github.io/<repo-name>/`
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
birthday message that pops up the first time she opens it. Commit and push,
and the site redeploys automatically.

## Using it
- **Draw / write**: the Excalidraw toolbar at the top (pen, text, shapes, arrows…).
- **Photos, GIFs, videos**: the **＋ Photo / video / GIF** button, the ☰ menu,
  drag-and-drop, or paste. Click a video once to use its play controls.
- Files can be up to **50 MB** each. Supabase's free plan holds about **1 GB**
  in total, so for long phone videos, trim or compress them first.
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
  iPad photos are converted to JPEG automatically, and videos are compressed
  by iOS before upload.

## Running locally
```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + anon key (or skip for demo mode)
npm run dev
```
