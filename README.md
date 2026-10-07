# sub4luv

A one-page site where people claim their free monthly Twitch sub (included with Amazon Prime), see a 30-day renewal countdown, follow a step-by-step phone walkthrough, and donate on Ko-fi if they don't have Prime.

It is plain HTML, CSS and JavaScript. No build step, no frameworks, nothing to install.

## What's in this folder

```
sub4luv/
├── index.html          the page (GitHub Pages looks for this exact name)
├── css/style.css       all styling
├── js/tracker.js       the 30-day renewal tracker (heavily commented)
├── js/main.js          the phone step-by-step animation
├── assets/
│   ├── favicon.svg
│   └── img/            the four Twitch screenshots used in the phone
├── .nojekyll           tells GitHub Pages to serve the files exactly as they are
└── README.md           this file
```

## Put it online with GitHub Pages (no command line needed)

1. **Make a GitHub account** at github.com if you don't have one.
2. Click **+ → New repository**. Name it `sub4luv`, set it to **Public**, and click **Create repository**.
3. On the new repo page click **uploading an existing file**.
4. Unzip this folder, then **drag everything inside the `sub4luv` folder** into the upload box: `index.html`, the `css`, `js` and `assets` folders, `.nojekyll` and `README.md`. (`index.html` must end up at the top level of the repo, not inside another folder.)
5. Click **Commit changes**.
6. Go to **Settings → Pages**. Under **Build and deployment** choose **Deploy from a branch**, pick the branch **main** and the folder **/ (root)**, then click **Save**.
7. Wait 1 to 2 minutes and refresh. Your site will be live at:

   `https://YOUR-GITHUB-USERNAME.github.io/sub4luv/`

> Tip: if you name the repository `YOUR-GITHUB-USERNAME.github.io`, the site is served at `https://YOUR-GITHUB-USERNAME.github.io/` with no extra path.

### Using the command line instead

```bash
cd sub4luv
git init
git add .
git commit -m "sub4luv website"
git branch -M main
git remote add origin https://github.com/YOUR-GITHUB-USERNAME/sub4luv.git
git push -u origin main
```
Then do step 6 above.

### Custom domain (optional)
In **Settings → Pages → Custom domain** enter your domain (for example `sub4luv.com`) and follow GitHub's DNS instructions. GitHub creates a `CNAME` file for you.

## Things you might want to change

| What | Where |
| --- | --- |
| Twitch sub link | `index.html`: search for `twitch.tv/subs/sub4luvv` (appears in the tracker `data-link`, the link under the button, and the `noscript` message). Also `link:` in `js/tracker.js` |
| Ko-fi link | `index.html`: search for `ko-fi.com/sub4luv` (2 places) |
| Countdown length (default 30 days) and the 5-minute delay | top of `js/tracker.js`: `windowMs` and `pendingDelayMs` |
| Phone step text and how long each step stays on screen | `js/main.js`: the `ST` array (milliseconds) |
| Colors and fonts | top of `css/style.css` (the `:root` variables) |
| Page title / description | the `<head>` of `index.html` |

## How the tracker behaves

- Clicking **Get your free sub** opens Twitch and starts a 5-minute wait. When it ends, the 30-day countdown starts automatically.
- After 30 days it says it's time to resubscribe.
- The state is saved in the visitor's own browser (`localStorage`), so it survives reloads and closing the tab, but it does not follow them to another phone or browser.
- The page can't check Twitch to confirm someone actually subscribed. The 5-minute wait stands in for "they finished signing up".

### Testing the tracker
Add `?trackerDev` to the address (for example `index.html?trackerDev`) to show a small **Reset timer** link. In the browser console you can also run:

```js
RenewalTracker.simulateElapsed(RenewalTracker.config.windowMs - 10000) // countdown ends in 10 seconds
RenewalTracker.reset()                                                  // back to the start
```

## Troubleshooting

- **404 page:** make sure `index.html` is at the top level of the repo and that Pages is switched on (step 6).
- **Phone screenshots missing:** folder and file names are case sensitive. Keep them exactly as shown above.
- **Changes not showing:** GitHub Pages can take a minute or two, and your browser may cache the old version, so try a hard refresh (Ctrl/Cmd + Shift + R).

Fonts (Inter) load from Google Fonts. If a visitor's browser blocks them, the page falls back to their system font.
