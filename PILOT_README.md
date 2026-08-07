# Homepage text editor — pilot

What this branch adds: a browser-based editor at **den1880.co/admin** where you
can change five text blocks on the homepage (the hero tag/subhead and the
"Memberships & Plans" section heading/tag/subhead) without touching code.
Save in the editor → it commits to GitHub → Netlify redeploys in about a
minute → the live site shows the new text.

This is a **pilot on the homepage only**, to prove the concept before wiring
up the rest of the site. Nothing here goes live until you merge the PR.

## One-time setup you need to do (I can't do these — they need your own
GitHub/Netlify logins)

**1. Create a GitHub OAuth App** (not a "GitHub App" — the older simpler
"OAuth App" type):
- Go to https://github.com/settings/developers → "OAuth Apps" → "New OAuth App"
  (do this under whichever account/org owns the `Den1880/website` repo).
- Application name: anything, e.g. "Den 1880 site editor"
- Homepage URL: `https://den1880.co`
- Authorization callback URL: `https://den1880.co/callback`
- Click "Register application", then "Generate a new client secret".
- Copy the **Client ID** and the **Client secret** somewhere safe — GitHub only
  shows the secret once.

**2. Add those to Netlify as environment variables:**
- Netlify → the `den1880` site → Site configuration → Environment variables →
  Add a variable, twice:
  - `GITHUB_OAUTH_CLIENT_ID` = the Client ID from step 1
  - `GITHUB_OAUTH_CLIENT_SECRET` = the Client secret from step 1
- Redeploy the site (or it'll pick these up on the next deploy — merging this
  PR will trigger one).

**3. Merge the PR** (after reviewing the Netlify deploy preview like normal).

**4. Log in at den1880.co/admin** — click "Login with GitHub", authorize the
app once. You'll need a GitHub account that has write access to
`Den1880/website` (yours or Jacklyn's login both work if they're on the repo).

## What's NOT in this pilot yet

- Only the 5 homepage fields listed above — not the hero headline itself
  (it has italic styling baked into the HTML; making that safely editable
  needs a slightly different field type, which I skipped for the pilot so
  there's zero chance of the loader script stripping the italics on load),
  and not any other page.
- No image/photo editing.
- If this feels good to use, tell me and I'll extend the same pattern to
  memberships.html, private-events.html, weddings.html, etc. — same
  mechanism, just more fields and more `content/*.json` files.

## How it works, briefly

- `content/homepage.json` holds the current text for those 5 fields.
- A small script at the bottom of `index.html` reads that file on every page
  load and drops the text into the matching spot on the page. If that fetch
  ever fails (offline, file missing), the page just shows whatever text is
  already sitting in the HTML — nothing can go blank.
- `/admin` is Sveltia CMS (a free, actively-maintained visual editor,
  drop-in-compatible with the older "Netlify CMS"/Decap CMS format). It reads
  `admin/config.yml` to know what fields to show you and which file they map to.
- `netlify/functions/auth.mjs` and `callback.mjs` are the login handshake —
  they're what steps 1–2 above wire up. No third-party service involved, no
  new account needed beyond the GitHub OAuth App.
