// functions/counter.js

const counterKey = "join_count"; // Key for KV store

/**
 * Cloudflare Pages Function onRequest handler for /functions/counter
 * - GET: Reads the current count from KV without incrementing.
 * - POST: Increments the count in KV and returns the new count.
 */
export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  // Ensure KV binding is configured
  if (!env.STATS_KV) {
    console.error("KV Namespace 'STATS_KV' is not bound.");
    return new Response(JSON.stringify({ error: "KV Namespace not configured", count: "N/A" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const kv = env.STATS_KV;
  let count = 0;
  let responseHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Adjust if needed
      'Cache-Control': 'no-cache, no-store, must-revalidate',
  };

  try {
    // Get the current count first for both methods
    const storedCount = await kv.get(counterKey);
    count = storedCount ? parseInt(storedCount, 10) : 0;

    // Check the request method
    if (request.method === 'POST') {
      // --- Increment Logic ---
      count++;
      // Asynchronously put the new count back into KV.
      waitUntil(kv.put(counterKey, count.toString()));
      console.log(`Counter incremented to: ${count}`); // Optional server-side log
      // Return the *newly incremented* count
      return new Response(JSON.stringify({ count: count }), { headers: responseHeaders });

    } else if (request.method === 'GET') {
      // --- Read-Only Logic ---
      console.log(`Counter read as: ${count}`); // Optional server-side log
      // Return the *current* count without incrementing
      return new Response(JSON.stringify({ count: count }), { headers: responseHeaders });

    } else {
      // --- Handle other methods (optional) ---
      return new Response(JSON.stringify({ error: "Method not allowed", count: count }), {
          status: 405, // Method Not Allowed
          headers: responseHeaders,
       });
    }

  } catch (error) {
    console.error("KV Operation Error:", error);
    // Return an error response, potentially with the last known count before error
    return new Response(JSON.stringify({ error: "Could not access or update count", count: count }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}