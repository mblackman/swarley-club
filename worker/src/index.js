import { createHash } from 'node:crypto';

import { Hono } from "hono";
import { cors } from "hono/cors";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const app = new Hono();

// CORS for all API routes. The dev preview page lives on *.pages.dev and calls
// the dev Worker cross-origin, so preflight (triggered by the Authorization
// header on admin routes) must be handled.
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

const responseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

// --- Submission config (keep in sync with page/submit.js) -------------------
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB per image (hard cap)

// --- Abuse / storage guards -------------------------------------------------
const STORAGE_BUDGET_DEFAULT = 5 * 1024 * 1024 * 1024; // 5 GiB (override via STORAGE_BUDGET_BYTES var)
const MAX_PENDING_SUBMISSIONS = 300;   // cap the photo moderation backlog
const MAX_PENDING_MEMORIES = 500;      // cap the guestbook moderation backlog
const MAX_UPLOADS_PER_IP_DAY = 25;     // per uploader, rolling 24h
const DAY_MS = 24 * 60 * 60 * 1000;

// sha256(ip + salt) — same privacy-preserving scheme as the counter.
function hashIp(c) {
  const ip = c.req.header('CF-Connecting-IP');
  if (!ip || !c.env.IP_HASH_SALT) return null;
  const h = createHash('sha256');
  h.update(ip);
  h.update(c.env.IP_HASH_SALT);
  return h.digest('hex');
}

// --- Guestbook config (keep in sync with page/memories.js) ------------------
const MAX_MESSAGE = 2000;
const MAX_AUTHOR = 80;

// --- Email notifications (Cloudflare Email Routing) -------------------------
const NOTIFY_FROM = 'notify@swarley.club';
const NOTIFY_TO = 'mateoblackman@gmail.com';
const ADMIN_URL = 'https://swarley.club/admin.html';

// Best-effort email notification. Never throws — call via executionCtx.waitUntil
// so a mail failure can't fail the visitor's submission.
async function sendNotification(c, subject, text) {
  if (!c.env.SEND_EMAIL) return; // binding absent (e.g. `wrangler dev` locally)
  try {
    const msg = createMimeMessage();
    msg.setSender({ name: 'Swarley Club', addr: NOTIFY_FROM });
    msg.setRecipient(NOTIFY_TO);
    msg.setSubject(subject);
    msg.addMessage({ contentType: 'text/plain', data: text });
    const email = new EmailMessage(NOTIFY_FROM, NOTIFY_TO, msg.asRaw());
    await c.env.SEND_EMAIL.send(email);
  } catch (err) {
    console.error('Email notification failed:', err);
  }
}

// ===========================================================================
// Counter (unchanged)
// ===========================================================================
async function getCount(c) {
  const { results } = await c.env.DB.prepare(`
    SELECT COUNT(*) AS unique_count FROM unique_visits;
  `).run();
  return results ? results[0].unique_count : 0;
}

async function checkExistingId(c, id) {
  const { results } = await c.env.DB.prepare(`
    SELECT id FROM unique_visits WHERE id = ?;
  `).bind(id).all();
  return results.length > 0;
}

app.get("/api/counter", async (c) => {
  const count = await getCount(c);
  return c.json({ count: count }, 200, responseHeaders)
});

app.post("/api/counter", async (c) => {
  const clientIP = c.req.header('CF-Connecting-IP');

  if (clientIP === undefined) {
    return c.json(
      { error: 'Could not determine client IP' },
      400,
      responseHeaders
    );
  }

  try {
    const hash = createHash('sha256');
    const salt = c.env.IP_HASH_SALT;
    hash.update(clientIP);
    hash.update(salt);
    const id = hash.digest('hex');
    const exists = await checkExistingId(c, id);

    if (exists) {
      const count = await getCount(c);
      return c.json({ count: count }, 200, responseHeaders);
    }

    const timestamp = Date.now();
    const {success} = await c.env.DB.prepare(
      `
      INSERT OR IGNORE INTO unique_visits (id, timestamp) VALUES (?, ?);
      `
    ).bind(id, timestamp)
    .run();

    const count = await getCount(c);
    if (success) {
      return c.json({ count: count }, 200, responseHeaders);
    }
    return c.json({ error: 'Failed to update count' }, 500, responseHeaders);
  } catch (error) {
    console.error('D1 Operation Error:', error);
    return c.json(
      { error: 'Could not access or update count', details: error.message },
      500,
      responseHeaders
    );
  }
});

// ===========================================================================
// Submissions
// ===========================================================================

// Verify a Cloudflare Turnstile token server-side.
async function verifyTurnstile(c, token) {
  if (!c.env.TURNSTILE_SECRET) {
    console.error('TURNSTILE_SECRET is not set');
    return false;
  }
  const form = new URLSearchParams();
  form.append('secret', c.env.TURNSTILE_SECRET);
  form.append('response', token || '');
  const ip = c.req.header('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verify failed:', err);
    return false;
  }
}

// Bearer-token admin guard.
async function requireAdmin(c, next) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401, responseHeaders);
  }
  await next();
}

// POST /api/submissions — public upload (stored as 'pending').
app.post('/api/submissions', async (c) => {
  let body;
  try {
    body = await c.req.parseBody();
  } catch (err) {
    return c.json({ error: 'Invalid form data' }, 400, responseHeaders);
  }

  // 1) Turnstile first — cheapest rejection for bots.
  const ok = await verifyTurnstile(c, body['cf-turnstile-response']);
  if (!ok) {
    return c.json({ error: 'Verification failed. Please try again.' }, 403, responseHeaders);
  }

  // 2) Validate the file.
  const file = body['file'];
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'No image was provided' }, 400, responseHeaders);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return c.json({ error: 'Unsupported image type' }, 400, responseHeaders);
  }
  if (file.size <= 0 || file.size > MAX_SIZE) {
    return c.json({ error: 'Image must be between 1 byte and 8 MB' }, 400, responseHeaders);
  }

  // 2.5) Abuse / storage guards.
  const ipHash = hashIp(c);
  try {
    const pending = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE status = 'pending';`
    ).first();
    if (pending && pending.n >= MAX_PENDING_SUBMISSIONS) {
      return c.json({ error: 'There are lots of photos waiting to be reviewed right now. Please try again later. 💛' }, 429, responseHeaders);
    }

    if (ipHash) {
      const recent = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM submissions WHERE ip_hash = ? AND created_at > ?;`
      ).bind(ipHash, Date.now() - DAY_MS).first();
      if (recent && recent.n >= MAX_UPLOADS_PER_IP_DAY) {
        return c.json({ error: "Thank you for sharing so many! You've reached today's limit — please come back tomorrow." }, 429, responseHeaders);
      }
    }

    const budget = Number(c.env.STORAGE_BUDGET_BYTES) || STORAGE_BUDGET_DEFAULT;
    const used = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(size), 0) AS total FROM submissions WHERE status IN ('pending', 'approved');`
    ).first();
    if (used && Number(used.total) + file.size > budget) {
      return c.json({ error: "We've reached our photo storage limit for now. Thank you so much — please check back later." }, 507, responseHeaders);
    }
  } catch (err) {
    console.error('Guard check error:', err);
    return c.json({ error: 'Could not save submission' }, 500, responseHeaders);
  }

  // 3) Store in R2 + record as pending.
  try {
    const id = crypto.randomUUID();
    const ext = EXT_BY_MIME[file.type];
    const key = `submissions/${id}.${ext}`;
    const submitter = String(body['name'] || '').slice(0, 80) || null;
    const caption = String(body['caption'] || '').slice(0, 500) || null;
    const filename = (file.name ? String(file.name) : '').slice(0, 255) || null;

    await c.env.SUBMISSIONS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    await c.env.DB.prepare(`
      INSERT INTO submissions
        (id, r2_key, filename, submitter, caption, mime, size, status, created_at, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);
    `).bind(id, key, filename, submitter, caption, file.type, file.size, Date.now(), ipHash).run();

    c.executionCtx.waitUntil(sendNotification(
      c,
      '📸 New photo awaiting approval — Swarley Club',
      `A new photo was submitted and is waiting for your approval.\n\n` +
        `From: ${submitter || 'Anonymous'}\n` +
        `Caption: ${caption || '(none)'}\n` +
        `File: ${filename || '(unknown)'}\n\n` +
        `Review it here: ${ADMIN_URL}`
    ));

    return c.json({ ok: true }, 201, responseHeaders);
  } catch (err) {
    console.error('Submission error:', err);
    return c.json({ error: 'Could not save submission', details: err.message }, 500, responseHeaders);
  }
});

// GET /api/submissions — public list of APPROVED submissions only.
app.get('/api/submissions', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, submitter, caption, created_at
      FROM submissions
      WHERE status = 'approved'
      ORDER BY created_at DESC;
    `).all();
    const items = (results || []).map((r) => ({
      id: r.id,
      submitter: r.submitter,
      caption: r.caption,
      created_at: r.created_at,
      imageUrl: `/api/submissions/${r.id}/image`,
    }));
    return c.json(items, 200, responseHeaders);
  } catch (err) {
    console.error('List submissions error:', err);
    return c.json({ error: 'Could not list submissions' }, 500, responseHeaders);
  }
});

// GET /api/submissions/:id/image — stream from R2.
// Approved images are public + cacheable. Pending/rejected require an admin
// bearer token (used by the moderation UI); otherwise 404 (no enumeration).
app.get('/api/submissions/:id/image', async (c) => {
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare(`
      SELECT r2_key, mime, status FROM submissions WHERE id = ?;
    `).bind(id).first();
    if (!row) return c.json({ error: 'Not found' }, 404, responseHeaders);

    let cacheControl;
    if (row.status === 'approved') {
      cacheControl = 'public, max-age=31536000, immutable';
    } else {
      // Non-public image: only an authenticated admin may view it.
      const auth = c.req.header('Authorization') || '';
      const token = auth.replace(/^Bearer\s+/i, '');
      if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) {
        return c.json({ error: 'Not found' }, 404, responseHeaders);
      }
      cacheControl = 'no-store';
    }

    const obj = await c.env.SUBMISSIONS_BUCKET.get(row.r2_key);
    if (!obj) return c.json({ error: 'Not found' }, 404, responseHeaders);

    return new Response(obj.body, {
      status: 200,
      headers: {
        'Content-Type': row.mime,
        'Cache-Control': cacheControl,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Serve image error:', err);
    return c.json({ error: 'Could not load image' }, 500, responseHeaders);
  }
});

// ===========================================================================
// Admin moderation (Bearer ADMIN_TOKEN)
// ===========================================================================

// POST /api/admin/submissions/upload — owner uploads a photo straight to the
// gallery (stored as 'approved', no Turnstile, no per-IP/backlog caps). The
// storage budget is still honored. Mirrors the public upload otherwise.
app.post('/api/admin/submissions/upload', requireAdmin, async (c) => {
  let body;
  try {
    body = await c.req.parseBody();
  } catch (err) {
    return c.json({ error: 'Invalid form data' }, 400, responseHeaders);
  }

  const file = body['file'];
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return c.json({ error: 'No image was provided' }, 400, responseHeaders);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return c.json({ error: 'Unsupported image type' }, 400, responseHeaders);
  }
  if (file.size <= 0 || file.size > MAX_SIZE) {
    return c.json({ error: 'Image must be between 1 byte and 8 MB' }, 400, responseHeaders);
  }

  try {
    const budget = Number(c.env.STORAGE_BUDGET_BYTES) || STORAGE_BUDGET_DEFAULT;
    const used = await c.env.DB.prepare(
      `SELECT COALESCE(SUM(size), 0) AS total FROM submissions WHERE status IN ('pending', 'approved');`
    ).first();
    if (used && Number(used.total) + file.size > budget) {
      return c.json({ error: 'Storage budget reached.' }, 507, responseHeaders);
    }

    const id = crypto.randomUUID();
    const ext = EXT_BY_MIME[file.type];
    const key = `submissions/${id}.${ext}`;
    const submitter = String(body['name'] || '').slice(0, 80) || null;
    const caption = String(body['caption'] || '').slice(0, 500) || null;
    const filename = (file.name ? String(file.name) : '').slice(0, 255) || null;
    const now = Date.now();

    await c.env.SUBMISSIONS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    await c.env.DB.prepare(`
      INSERT INTO submissions
        (id, r2_key, filename, submitter, caption, mime, size, status, created_at, reviewed_at, ip_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, NULL);
    `).bind(id, key, filename, submitter, caption, file.type, file.size, now, now).run();

    return c.json({ ok: true, id }, 201, responseHeaders);
  } catch (err) {
    console.error('Admin upload error:', err);
    return c.json({ error: 'Could not save photo', details: err.message }, 500, responseHeaders);
  }
});

// GET /api/admin/submissions — list pending.
app.get('/api/admin/submissions', requireAdmin, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, filename, submitter, caption, mime, size, created_at
      FROM submissions
      WHERE status = 'pending'
      ORDER BY created_at ASC;
    `).all();
    return c.json(results || [], 200, responseHeaders);
  } catch (err) {
    console.error('Admin list error:', err);
    return c.json({ error: 'Could not list submissions' }, 500, responseHeaders);
  }
});

// POST /api/admin/submissions/:id — approve or reject.
app.post('/api/admin/submissions/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  let action;
  try {
    ({ action } = await c.req.json());
  } catch {
    return c.json({ error: 'Invalid body' }, 400, responseHeaders);
  }
  if (action !== 'approve' && action !== 'reject') {
    return c.json({ error: 'action must be "approve" or "reject"' }, 400, responseHeaders);
  }

  try {
    const row = await c.env.DB.prepare(`
      SELECT r2_key FROM submissions WHERE id = ?;
    `).bind(id).first();
    if (!row) return c.json({ error: 'Not found' }, 404, responseHeaders);

    const status = action === 'approve' ? 'approved' : 'rejected';
    await c.env.DB.prepare(`
      UPDATE submissions SET status = ?, reviewed_at = ? WHERE id = ?;
    `).bind(status, Date.now(), id).run();

    // Free the storage for rejected images.
    if (action === 'reject') {
      try { await c.env.SUBMISSIONS_BUCKET.delete(row.r2_key); }
      catch (e) { console.error('R2 delete failed:', e); }
    }

    return c.json({ ok: true, status }, 200, responseHeaders);
  } catch (err) {
    console.error('Moderate error:', err);
    return c.json({ error: 'Could not update submission' }, 500, responseHeaders);
  }
});

// DELETE /api/admin/submissions/:id — fully remove (e.g. an already-approved item).
app.delete('/api/admin/submissions/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  try {
    const row = await c.env.DB.prepare(`
      SELECT r2_key FROM submissions WHERE id = ?;
    `).bind(id).first();
    if (!row) return c.json({ error: 'Not found' }, 404, responseHeaders);

    try { await c.env.SUBMISSIONS_BUCKET.delete(row.r2_key); }
    catch (e) { console.error('R2 delete failed:', e); }
    await c.env.DB.prepare(`DELETE FROM submissions WHERE id = ?;`).bind(id).run();

    return c.json({ ok: true }, 200, responseHeaders);
  } catch (err) {
    console.error('Delete error:', err);
    return c.json({ error: 'Could not delete submission' }, 500, responseHeaders);
  }
});

// ===========================================================================
// Guestbook ("leave a memory")
// ===========================================================================

// POST /api/memories — public text submission (stored as 'pending').
app.post('/api/memories', async (c) => {
  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid request' }, 400, responseHeaders);
  }

  // Turnstile first.
  const ok = await verifyTurnstile(c, payload['cf-turnstile-response']);
  if (!ok) {
    return c.json({ error: 'Verification failed. Please try again.' }, 403, responseHeaders);
  }

  const message = String(payload.message || '').trim();
  if (!message) {
    return c.json({ error: 'Please write a message' }, 400, responseHeaders);
  }
  if (message.length > MAX_MESSAGE) {
    return c.json({ error: `Message must be ${MAX_MESSAGE} characters or fewer` }, 400, responseHeaders);
  }
  const author = String(payload.author || '').trim().slice(0, MAX_AUTHOR) || null;

  // Cap the moderation backlog (best-effort — never blocks on a guard error).
  try {
    const pending = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM memories WHERE status = 'pending';`
    ).first();
    if (pending && pending.n >= MAX_PENDING_MEMORIES) {
      return c.json({ error: 'There are lots of memories waiting to be reviewed right now. Please try again later. 💛' }, 429, responseHeaders);
    }
  } catch (err) {
    console.error('Memory guard error:', err);
  }

  try {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(`
      INSERT INTO memories (id, author, message, status, created_at)
      VALUES (?, ?, ?, 'pending', ?);
    `).bind(id, author, message.slice(0, MAX_MESSAGE), Date.now()).run();

    c.executionCtx.waitUntil(sendNotification(
      c,
      '✍️ New memory awaiting approval — Swarley Club',
      `A new memory was submitted and is waiting for your approval.\n\n` +
        `From: ${author || 'Anonymous'}\n\n` +
        `${message}\n\n` +
        `Review it here: ${ADMIN_URL}`
    ));

    return c.json({ ok: true }, 201, responseHeaders);
  } catch (err) {
    console.error('Memory submission error:', err);
    return c.json({ error: 'Could not save your memory', details: err.message }, 500, responseHeaders);
  }
});

// GET /api/memories — public list of APPROVED memories.
app.get('/api/memories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, author, message, created_at
      FROM memories
      WHERE status = 'approved'
      ORDER BY created_at DESC;
    `).all();
    return c.json(results || [], 200, responseHeaders);
  } catch (err) {
    console.error('List memories error:', err);
    return c.json({ error: 'Could not list memories' }, 500, responseHeaders);
  }
});

// GET /api/admin/memories — list pending (admin).
app.get('/api/admin/memories', requireAdmin, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT id, author, message, created_at
      FROM memories
      WHERE status = 'pending'
      ORDER BY created_at ASC;
    `).all();
    return c.json(results || [], 200, responseHeaders);
  } catch (err) {
    console.error('Admin list memories error:', err);
    return c.json({ error: 'Could not list memories' }, 500, responseHeaders);
  }
});

// POST /api/admin/memories/:id — approve or reject (admin).
app.post('/api/admin/memories/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  let action;
  try {
    ({ action } = await c.req.json());
  } catch {
    return c.json({ error: 'Invalid body' }, 400, responseHeaders);
  }
  if (action !== 'approve' && action !== 'reject') {
    return c.json({ error: 'action must be "approve" or "reject"' }, 400, responseHeaders);
  }
  try {
    const status = action === 'approve' ? 'approved' : 'rejected';
    const { meta } = await c.env.DB.prepare(`
      UPDATE memories SET status = ?, reviewed_at = ? WHERE id = ?;
    `).bind(status, Date.now(), id).run();
    if (meta && meta.changes === 0) {
      return c.json({ error: 'Not found' }, 404, responseHeaders);
    }
    return c.json({ ok: true, status }, 200, responseHeaders);
  } catch (err) {
    console.error('Moderate memory error:', err);
    return c.json({ error: 'Could not update memory' }, 500, responseHeaders);
  }
});

// DELETE /api/admin/memories/:id — fully remove (admin).
app.delete('/api/admin/memories/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare(`DELETE FROM memories WHERE id = ?;`).bind(id).run();
    return c.json({ ok: true }, 200, responseHeaders);
  } catch (err) {
    console.error('Delete memory error:', err);
    return c.json({ error: 'Could not delete memory' }, 500, responseHeaders);
  }
});

export default app;
