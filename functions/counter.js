import { createHash } from 'crypto';

/**
 * Cloudflare Pages Function onRequest handler for /functions/counter
 * - GET: Reads the current count from KV without incrementing.
 * - POST: Increments the count in KV and returns the new count.
 */
export async function onRequest(context) {
  const { request, env } = context;

  async function getCount() {
    const { results } = await env.DB.prepare(
      `
      SELECT COUNT(*) AS unique_count FROM unique_visits;
    `
    ).first();
    return results?.unique_count || 0;
  }

  let responseHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    // Check the request method
    if (request.method === "POST") {
      const clientIP = request.headers.get('CF-Connecting-IP');
      if (!clientIP) {
        return new Response(JSON.stringify({ error: 'Could not determine client IP' }), { status: 400 });
      }
      const hash = createHash("sha256");
      hash.update(clientIP);
      const hashedIP = hash.digest("hex");
      const timestamp = Date.now();

      const { success } = await env.DB.exec(
        `
        INSERT OR IGNORE INTO unique_visits (id, timestamp) VALUES (?, ?);
      `,
        [hashedIP, timestamp]
      );

      const count = await getCount();
      console.log(`Counter incremented to: ${count}`);
      return new Response(JSON.stringify({ count: count }), {
        headers: responseHeaders,
      });
    } else if (request.method === "GET") {
      const count = await getCount();
      return new Response(JSON.stringify({ count: count }), {
        headers: responseHeaders,
      });
    } else {
      const count = await getCount();
      return new Response(
        JSON.stringify({ error: "Method not allowed", count: count }),
        {
          status: 405,
          headers: responseHeaders,
        }
      );
    }
  } catch (error) {
    console.error("D1 Operation Error:", error);
    return new Response(
      JSON.stringify({
        error: "Could not access or update count",
        count: count,
      }),
      {
        status: 500,
        headers: responseHeaders,
      }
    );
  }
}
