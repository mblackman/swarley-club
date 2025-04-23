import { createHash } from 'node:crypto';

import { Hono } from "hono";

const app = new Hono();

const responseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

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
    return c.json({ count: count }, 500, responseHeaders);
  } catch (error) {
    console.error('D1 Operation Error:', error);
    return c.json(
      { error: 'Could not access or update count', details: error.message },
      500,
      responseHeaders
    );
  }
});

export default app;
