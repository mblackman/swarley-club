// Shared front-end config, loaded by every page before its own script.
//
// API_BASE lets the SAME static files work in two places:
//   - Production: served from https://swarley.club, where the Cloudflare
//     Worker owns swarley.club/api/* — so same-origin "/api" reaches it.
//   - Dev preview: served from a *.pages.dev URL, which has NO Worker route,
//     so we must call the isolated dev Worker on its *.workers.dev URL.
//
// TODO(dev): after `wrangler deploy --env dev` prints the dev Worker URL,
// paste it below (keep the trailing "/api", no trailing slash).
window.SWARLEY = window.SWARLEY || {};
window.SWARLEY.API_BASE =
  location.hostname === "swarley.club"
    ? "/api"
    : "https://swarley-club-dev.mateoblackman.workers.dev/api";
