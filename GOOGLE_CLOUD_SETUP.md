# Google Cloud setup (one-time)

The site at the repo root talks to Google Sheets and Gmail directly from the browser, so it needs its
own OAuth Client ID. This is a one-time setup — after this, all future code changes are just
`git push`, no more manual steps in Google's console.

## 1. Create a project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or pick an existing one you're fine using for this).

## 2. Enable the two APIs

In the project, go to **APIs & Services → Library** and enable:
- **Google Sheets API**
- **Gmail API**

## 3. Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. User type: **External**.
3. Fill in app name (e.g. "Event Inviter"), your email as support/developer contact.
4. Under **Scopes**, add:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/gmail.compose`
5. Add yourself under **Test users** for now (harmless even though you'll publish it next).
6. Save, then on the consent screen's summary page click **Publish App** to move it out of
   Testing. Since you chose not to go through Google's verification, every sign-in will show an
   "Google hasn't verified this app" screen — click **Advanced → Go to Event Inviter (unsafe)**
   to continue. This is expected and only affects you (or anyone you personally hand the URL to).

## 4. Create the OAuth Client ID

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: e.g. "Event Inviter Web".
4. Under **Authorized JavaScript origins**, add:
   - `https://ainlamyae.github.io` (the GitHub Pages origin)
   - `http://localhost:8000` (optional, only if you want to test locally first — see below)
5. Leave "Authorized redirect URIs" empty — this app uses the token flow, not redirect-based.
6. Click **Create**. Copy the **Client ID** (looks like `123...apps.googleusercontent.com`).

## 5. Wire the Client ID into the site

Open `js/config.js` in this repo and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with
the Client ID you just copied. Commit and push — GitHub Pages redeploys automatically.

## 6. Enable GitHub Pages

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Save.
4. GitHub Pages requires the repo to be public (or a paid plan for private Pages) — confirm
   that's acceptable before enabling, since it makes the code (not your data) publicly visible.
5. After a minute, the site is live at `https://ainlamyae.github.io/event-inviter/`.

## Testing locally first (optional)

From the repo root, run a simple local server, e.g.:

```
python -m http.server 8000
```

Then open `http://localhost:8000`. This only works if you added `http://localhost:8000` as an
authorized origin in step 4.
