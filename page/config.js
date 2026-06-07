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

// Turnstile site key (public), chosen by hostname like API_BASE so the same
// committed files are correct in both environments — no per-merge swap.
//   - Production (swarley.club): the REAL site key from the Turnstile dashboard.
//   - Dev preview / localhost: the always-pass TEST key.
// TODO(prod): replace REAL_PROD_SITEKEY below with the real Turnstile site key
// before merging to main, or spam protection is effectively off in production.
window.SWARLEY.TURNSTILE_SITEKEY =
  location.hostname === "swarley.club"
    ? "0x4AAAAAADgVzVCo2TAFaibr"
    : "1x00000000000000000000AA";
