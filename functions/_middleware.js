// Content negotiation for agents (Cloudflare Pages Functions).
// - GET / with Accept preferring text/markdown returns index.md as text/markdown.
// - GET /?mode=agent returns a structured JSON description for agents.
// - GET /resume.json returns the CV as JSON Resume, with CORS open for reads.
// - GET / with Accept preferring application/json returns resume.json.
// - Any 404 requested with Accept preferring text/markdown returns a short Markdown error.
// - Browsers (Accept: text/html) get the Eleventy-generated static site.

const MARKDOWN = "text/markdown; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const RESUME_HEADERS = {
  "Content-Type": JSON_TYPE,
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-cache",
  Link: '<https://jsonresume.org/schema>; rel="describedby"',
};

const NOT_FOUND_MD = `# 404: page not found

There's nothing at this address on jonathan.jawnhaas.xyz.

- Homepage: https://jonathan.jawnhaas.xyz/
- Summary for agents: https://jonathan.jawnhaas.xyz/llms.txt
- All pages: https://jonathan.jawnhaas.xyz/sitemap.xml
`;

// Parse an Accept header into [{type, q}] in header order.
function parseAccept(header) {
  return (header || "")
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().toLowerCase().split(";");
      let q = 1;
      for (const p of params) {
        const [k, v] = p.trim().split("=");
        if (k === "q") {
          const n = parseFloat(v);
          q = Number.isNaN(n) ? 0 : n;
        }
      }
      return { type: type.trim(), q };
    })
    .filter((e) => e.type);
}

// True when the client explicitly names this type at least as strongly as HTML.
// Wildcards (*/*) don't count, so browsers and curl's default keep getting HTML.
function prefersType(header, type) {
  const entries = parseAccept(header);
  const qOf = (t) => {
    const hit = entries.find((e) => e.type === t);
    return hit ? hit.q : 0;
  };
  const wanted = qOf(type);
  if (wanted <= 0) return false;
  return wanted >= qOf("text/html");
}

export const prefersMarkdown = (header) => prefersType(header, "text/markdown");
export const prefersJson = (header) => prefersType(header, "application/json");

function withHeaders(response, extra) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function addVaryAccept(response) {
  const vary = response.headers.get("Vary");
  if (vary && /(^|,\s*)accept(\s*,|$)/i.test(vary)) return response;
  return withHeaders(response, { Vary: vary ? `${vary}, Accept` : "Accept" });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return next();

  const url = new URL(request.url);
  const wantsMarkdown = prefersMarkdown(request.headers.get("Accept"));
  const isHome = url.pathname === "/" || url.pathname === "/index.html";

  if (isHome && url.searchParams.get("mode") === "agent") {
    const asset = await env.ASSETS.fetch(new URL("/agent.json", url));
    if (asset.ok) {
      return new Response(method === "HEAD" ? null : asset.body, {
        status: 200,
        headers: { "Content-Type": JSON_TYPE, "Cache-Control": "no-cache" },
      });
    }
  }

  // The CV as JSON Resume (https://jsonresume.org/schema), readable from any origin.
  if (url.pathname === "/resume.json") {
    const asset = await next();
    if (!asset.ok) return asset;
    return withHeaders(asset, RESUME_HEADERS);
  }

  if (isHome && !wantsMarkdown && prefersJson(request.headers.get("Accept"))) {
    const asset = await env.ASSETS.fetch(new URL("/resume.json", url));
    if (asset.ok) {
      return new Response(method === "HEAD" ? null : asset.body, {
        status: 200,
        headers: { ...RESUME_HEADERS, Vary: "Accept", "Content-Location": "/resume.json" },
      });
    }
  }

  if (isHome && wantsMarkdown) {
    const asset = await env.ASSETS.fetch(new URL("/index.md", url));
    if (asset.ok) {
      return new Response(method === "HEAD" ? null : asset.body, {
        status: 200,
        headers: { "Content-Type": MARKDOWN, Vary: "Accept", "Cache-Control": "no-cache" },
      });
    }
  }

  const response = await next();

  if (response.status === 404 && wantsMarkdown) {
    return new Response(method === "HEAD" ? null : NOT_FOUND_MD, {
      status: 404,
      headers: { "Content-Type": MARKDOWN, Vary: "Accept", "Cache-Control": "no-cache" },
    });
  }

  if (isHome || response.status === 404) return addVaryAccept(response);
  return response;
}
