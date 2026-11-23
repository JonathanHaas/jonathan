// Content negotiation for agents (Cloudflare Pages Functions).
// - GET / with Accept preferring text/markdown returns index.md as text/markdown.
// - Any 404 requested with Accept preferring text/markdown returns a short Markdown error.
// - Browsers (Accept: text/html) get the normal static site, unchanged.

const MARKDOWN = "text/markdown; charset=utf-8";

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

export async function onRequest(context) {
  const { request, env, next } = context;
  const method = request.method;
  if (method !== "GET" && method !== "HEAD") return next();

  const url = new URL(request.url);
  const wantsMarkdown = prefersMarkdown(request.headers.get("Accept"));
  const isHome = url.pathname === "/" || url.pathname === "/index.html";

  if (isHome && wantsMarkdown) {
    const asset = await env.ASSETS.fetch(new URL("/index.md", url));
    if (asset.ok) {
      const body = method === "HEAD" ? null : await asset.text();
      return new Response(body, {
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
