# Deploying swarley.club

This is the operational runbook for the memorial site. It covers the **dev**
(isolated test) environment and **production** promotion, plus the one-time
Cloudflare setup the features need.

Golden rule: **test everything on the dev environment first.** Dev is fully
isolated — separate Worker, D1 database, and R2 bucket — so it never touches the
live site at `swarley.club`.

---

## Architecture at a glance

| Piece | Production | Dev |
|---|---|---|
| Static page (`page/`) | Cloudflare Pages → `swarley.club` | Pages preview → `*.pages.dev` (branch `memorial-dev`) |
| Worker (`worker/`) | `swarley.club/api/*` | `swarley-club-dev.<account>.workers.dev` |
| D1 database | `swarley-club` | `swarley-club-dev` |
| R2 bucket | `swarley-submissions` | `swarley-submissions-dev` |
| Email notifications | Cloudflare Email Routing → mateoblackman@gmail.com | same |

The page calls the API through `page/config.js`, which auto-selects the base URL
by hostname (prod uses same-origin `/api`; the dev preview targets the dev
Worker).

### What's where

- **Counter** (`/api/counter`, table `unique_visits`) — the "candles lit"
  counter. Unchanged from the original site.
- **Photo submissions** (`/api/submissions*`, table `submissions`, R2) — public
  upload, held as `pending` until approved on `admin.html`.
- **Guestbook** (`/api/memories*`, table `memories`) — public "leave a memory",
  also moderated on `admin.html`.
- **Email** — a notification fires to mateoblackman@gmail.com on each new pending
  photo or memory.

---

## Commands (run from `worker/`)

`package.json` provides shortcuts:

```bash
npm run dev          # wrangler dev (local)
npm run deploy:dev   # deploy the DEV worker (wrangler deploy --env dev)
npm run deploy       # deploy the PRODUCTION worker
npm run migrate:dev  # apply D1 migrations to swarley-club-dev (remote)
npm run migrate      # apply D1 migrations to swarley-club (remote)
```

---

## One-time Cloudflare setup

You only do these once per environment. `wrangler login` is interactive, so run
these yourself.

### 1. Turnstile (spam protection for the forms)

1. Cloudflare dashboard → **Turnstile** → **Add site**.
   - Production: add domain `swarley.club`.
   - Dev: add your `*.pages.dev` preview domain (or just use the test keys below).
2. Copy the **Site key** (public) into `page/config.js` → `TURNSTILE_SITEKEY`.
   It's hostname-selected: the `swarley.club` branch gets the real prod key, the
   `else` branch keeps the dev/test key — both committed, no per-merge swap. The
   forms (`submit.html`, `memories.html`) render the widget from this value via
   `submit.js`/`memories.js`, so there is **no** `data-sitekey` in the HTML.
3. Copy the **Secret key** into the Worker (see secrets below).

**Dev shortcut — Turnstile test keys (always pass, no dashboard site needed):**
- Site key: `1x00000000000000000000AA`
- Secret key: `1x0000000000000000000000000000000AA`

### 2. Email Routing (notifications)

1. Cloudflare dashboard → **swarley.club → Email → Email Routing → Enable**
   (auto-adds the required DNS records).
2. **Destination addresses → Add** `mateoblackman@gmail.com` → click the
   verification link Cloudflare emails you.
   - The `send_email` binding is locked to this one address.
   - `notify@swarley.club` is the "from" — you do **not** need to create that
     mailbox, the domain just needs Email Routing enabled.
3. Until this is done, notification sends fail silently (logged only) and
   **submissions still work** — nothing breaks if you deploy first.

---

## Dev deploy (do this first)

From `worker/`:

```bash
# 1. Create the isolated dev resources
npx wrangler d1 create swarley-club-dev          # copy the printed database_id ...
#    ... paste it into wrangler.toml under [[env.dev.d1_databases]]
#    replacing PLACEHOLDER_DEV_D1_ID
npx wrangler r2 bucket create swarley-submissions-dev

# 2. Apply migrations (creates unique_visits, submissions, memories)
npm run migrate:dev

# 3. Set dev secrets
npx wrangler secret put ADMIN_TOKEN     --env dev   # any long random string (you paste this into admin.html)
npx wrangler secret put TURNSTILE_SECRET --env dev   # dev test secret: 1x0000000000000000000000000000000AA
npx wrangler secret put IP_HASH_SALT    --env dev   # any random string

# 4. Deploy the dev worker — note the printed *.workers.dev URL
npm run deploy:dev
```

Then wire the page to the dev Worker and push so the Pages preview rebuilds:

1. `page/config.js` — confirm the dev `API_BASE` points at your real
   `*.workers.dev` host (keep the trailing `/api`).
2. `page/config.js` — the `else` (non-`swarley.club`) branch of
   `TURNSTILE_SITEKEY` already holds the test key `1x00000000000000000000AA`,
   which the `*.pages.dev` preview uses automatically — no edit needed.
3. Commit and push:
   ```bash
   git commit -am "wire dev config" && git push
   ```
   The `memorial-dev` branch builds a `*.pages.dev` preview automatically.

### Test on the preview

- Home + gallery render; **Light a candle** increments the counter.
- **Share a Photo** → "waiting for approval"; you receive a notification email.
- **Leave a memory** → "waiting for approval"; notification email.
- Open `admin.html` → paste your `ADMIN_TOKEN` → the pending photo and memory
  appear → **Approve** → they show up on the gallery / memories pages.

---

## Production promotion (after you're happy)

```bash
# From worker/
npx wrangler r2 bucket create swarley-submissions       # one-time
npm run migrate                                         # applies 0002 + 0003 to prod D1
npx wrangler secret put ADMIN_TOKEN                      # real admin token
npx wrangler secret put TURNSTILE_SECRET                 # REAL Turnstile secret key
# IP_HASH_SALT already exists in prod — leave it.
npm run deploy
```

Page side:
1. Set the **real** Turnstile site key in `page/config.js` →
   `TURNSTILE_SITEKEY` (the `swarley.club` branch). `API_BASE` needs no change —
   the prod branch already resolves to `/api` on `swarley.club`.
2. Merge `memorial-dev` → `main`; Cloudflare Pages builds production from `main`.

> **Order matters:** deploy the Worker before the page each time you add backend
> routes, or the forms will hit a 404.

---

## Routine tasks

### Add photos to the gallery (with the optimization pipeline)
Don't commit raw Google Photos exports — they're multi-MB each. Run them through
the pipeline first (needs `cd scripts && npm install` once):

1. Drop full-res originals into `scripts/source-photos/` (gitignored).
2. From `scripts/`: `npm run gallery`
   - Writes optimized **AVIF + WebP + JPEG**, in a **full** (≤1600px, for the
     lightbox) and **thumbnail** (≤600px, for the grid) size, into
     `page/images/gallery/`. Strips metadata, bakes in EXIF rotation.
   - Prints ready-to-paste `GALLERY` entries.
3. Paste those entries into the `GALLERY` array in `page/gallery.js`, fill in
   `alt`/`caption`, commit the generated `page/images/gallery/` files + push.

The grid loads tiny thumbnails and the browser picks AVIF/WebP automatically, so
even a huge gallery stays fast.

### Optimize the static assets
`page/`'s social image + app icons are kept compressed. If you replace any of
them, re-run `cd scripts && npm run assets` to recompress in place (JPEG via
mozjpeg, PNG via lossy palette) without changing dimensions.

### Moderate submissions
Open `admin.html`, paste your `ADMIN_TOKEN`, Approve/Reject pending photos and
memories. Rejecting a photo also deletes it from R2.

### Fill in his story
Edit the `[TODO]` placeholders in `page/index.html` (story, dates, timeline) and
the favorites list in `page/script.js`.

---

## Config / secrets reference

| Name | Where | Notes |
|---|---|---|
| `ADMIN_TOKEN` | Worker secret | Bearer token for `admin.html` moderation |
| `TURNSTILE_SECRET` | Worker secret | Turnstile secret key (dev test key OK for dev) |
| `IP_HASH_SALT` | Worker secret | Salt for hashing counter IPs (prod already set) |
| Turnstile **site** key | `page/config.js` `TURNSTILE_SITEKEY` | Public; hostname-selected (prod vs test) |
| Dev API base | `page/config.js` | `*.workers.dev` URL for the preview |
| Dev D1 id | `wrangler.toml` `[[env.dev.d1_databases]]` | From `wrangler d1 create` |

`.dev.vars`, `.wrangler/`, and `worker/node_modules` are gitignored. Never commit
secrets.

---

## Troubleshooting

- **Counter / lists show "N/A" or "couldn't load" on the preview** — `config.js`
  `API_BASE` still has the `YOUR-ACCOUNT` placeholder, or the dev Worker isn't
  deployed.
- **Form says "Verification failed"** — Turnstile site key (`config.js`
  `TURNSTILE_SITEKEY`) and secret (Worker `TURNSTILE_SECRET`) don't match, or the
  domain isn't registered with the widget. Use the test keys for dev.
- **No notification email** — Email Routing not enabled, or
  mateoblackman@gmail.com not verified as a destination. Submissions still
  succeed regardless. Check Worker logs (`wrangler tail --env dev`).
- **Admin shows "Invalid token"** — `ADMIN_TOKEN` secret doesn't match what you
  pasted.
- **Pending image won't load in admin** — that's expected for non-admins;
  `admin.js` fetches it with the bearer token. If it still fails, re-check the
  token.
