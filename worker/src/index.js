import { createHash } from 'node:crypto';

async function handleRequest(request, env) {
  const url = new URL(request.url);

  async function getCount() {
    const { results } = await env.DB.prepare(`
      SELECT COUNT(*) AS unique_count FROM unique_visits;
    `).first();
    return results?.unique_count || 0;
  }

  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  try {
    if (request.method === 'POST') {
      const clientIP = request.headers.get('CF-Connecting-IP');
      if (!clientIP) {
        return new Response(JSON.stringify({ error: 'Could not determine client IP' }), { status: 400, headers: responseHeaders });
      }
      const hash = createHash('sha256');
      hash.update(clientIP);
      const hashedIP = hash.digest('hex');
      const timestamp = Date.now();

      await env.DB.exec(
        `
        INSERT OR IGNORE INTO unique_visits (hashed_ip, timestamp) VALUES (?, ?);
        `,
        [hashedIP, timestamp]
      );

      const count = await getCount();
      console.log(`Counter incremented to: ${count}`);
      return new Response(JSON.stringify({ count: count }), { headers: responseHeaders });
    } else if (request.method === 'GET') {
      const count = await getCount();
      return new Response(JSON.stringify({ count: count }), { headers: responseHeaders });
    } else {
      const count = await getCount();
      return new Response(JSON.stringify({ error: 'Method not allowed', count: count }), {
        status: 405,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error('D1 Operation Error:', error);
    return new Response(
      JSON.stringify({
        error: 'Could not access or update count',
        count: 0,
      }),
      {
        status: 500,
        headers: responseHeaders,
      }
    );
  }
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request, event.env));
});