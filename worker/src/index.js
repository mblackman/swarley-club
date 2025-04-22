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
  `).first();
  return results?.unique_count || 0;
}

app.get("/api/counter", async (c) => {
  const count = await getCount(c);
  return c.json({count: count});
});

app.post("/api/counter", async (c) => {
  const hash = createHash('sha256');
  hash.update(clientIP);
  const hashedIP = hash.digest('hex');
  const timestamp = Date.now();
  await c.env.DB.exec(
    `
    INSERT OR IGNORE INTO unique_visits (hashed_ip, timestamp) VALUES (?, ?);
    `,
    [hashedIP, timestamp]
  );
  const count = await getCount(c);
  return c.json({count: count});
});

export default app;
