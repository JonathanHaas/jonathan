// Entry point when the site runs as a Cloudflare Worker with static assets
// (Workers Builds). Reuses the same content-negotiation logic as the Pages
// middleware in functions/_middleware.js, so both setups behave the same.
import { onRequest } from "../functions/_middleware.js";

export default {
  async fetch(request, env) {
    return onRequest({ request, env, next: () => env.ASSETS.fetch(request) });
  },
};
