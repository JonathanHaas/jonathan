// Content negotiation for agents (Cloudflare Pages Functions).
// - GET / with Accept preferring text/markdown returns index.md as text/markdown.
// - GET /?mode=agent returns a structured JSON description for agents.
// - Any 404 requested with Accept preferring text/markdown returns a short Markdown error.
// - Browsers (Accept: text/html) get the normal static site, with shared partials
//   filled in: "<!-- include:footer -->" becomes partials/footer.html on every page.

const MARKDOWN = "text/markdown; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";

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

// True when the client explicitly asks for Markdown at least as strongly as HTML.
export function prefersMarkdown(header) {
  const entries = parseAccept(header);
  const qOf = (type) => {
    const hit = entries.find((e) => e.type === type);
    return hit ? hit.q : 0;
  };
  const md = qOf("text/markdown");
  if (md <= 0) return false;
  return md >= qOf("text/html");
}

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

const INCLUDE = /<!--\s*include:([a-z0-9-]+)\s*-->/g;

// Replace <!-- include:name --> markers in an HTML response with partials/name.html.
async function fillIncludes(response, env, url, method) {
  const type = response.headers.get("Content-Type") || "";
  if (method === "HEAD" || !type.startsWith("text/html") || !response.body) return response;
  const html = await response.text();
  const names = [...new Set([...html.matchAll(INCLUDE)].map((m) => m[1]))];
  const parts = {};
  for (const name of names) {
    const r = await env.ASSETS.fetch(new URL(`/partials/${name}.html`, url));
    parts[name] = r.ok ? (await r.text()).trim() : "";
  }
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(html.replace(INCLUDE, (_, name) => parts[name]), { status: response.status, statusText: response.statusText, headers });
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

  const filled = await fillIncludes(response, env, url, method);
  if (isHome || response.status === 404) return addVaryAccept(filled);
  return filled;
}
