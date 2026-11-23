// Tests for functions/_middleware.js. Run from the repo root with: node --test
// No dependencies: Node 22+ provides Request, Response, Headers and node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest, prefersMarkdown } from "../functions/_middleware.js";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const assets = {
  "/": ["index.html", "text/html"],
  "/index.md": ["index.md", "text/markdown"],
  "/agent.json": ["agent.json", "application/json"],
  "/about.md": ["about.md", "text/markdown"],
  "/contact.md": ["contact.md", "text/markdown"],
  "/privacy.md": ["privacy.md", "text/markdown"],
  "/llms.txt": ["llms.txt", "text/plain"],
  "/about/": ["about/index.html", "text/html"],
  "/contact/": ["contact/index.html", "text/html"],
  "/privacy/": ["privacy/index.html", "text/html"],
};

// Stand-in for Cloudflare Pages static serving: known files return 200, anything else 404.html with 404.
function serve(url) {
  const hit = assets[new URL(url).pathname];
  if (hit) return new Response(read(hit[0]), { status: 200, headers: { "Content-Type": hit[1] } });
  return new Response(read("404.html"), { status: 404, headers: { "Content-Type": "text/html" } });
}

async function call(path, accept, method = "GET") {
  const request = new Request("https://jonathan.jawnhaas.xyz" + path, { method, headers: accept ? { Accept: accept } : {} });
  return onRequest({ request, env: { ASSETS: { fetch: (u) => serve(String(u)) } }, next: () => serve(request.url) });
}

test("homepage returns Markdown for Accept: text/markdown", async () => {
  const r = await call("/", "text/markdown");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /^text\/markdown/);
  assert.match(r.headers.get("Vary"), /Accept/);
  const body = await r.text();
  assert.ok(body.startsWith("# L. Jonathan Haas"));
});

test("agent mode returns a structured machine-readable view", async () => {
  const r = await call("/?mode=agent", "text/html");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /^application\/json/);
  const data = await r.json();
  assert.equal(data.mode, "agent");
  assert.equal(data.authentication.required, false);
  assert.equal(data.api.available, false);
  assert.ok(data.capabilities.length >= 3);
  assert.equal(data.endpoints.markdown_home.media_type, "text/markdown");
});

test("homepage still returns HTML for browsers", async () => {
  const r = await call("/", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /^text\/html/);
  assert.match(r.headers.get("Vary"), /Accept/);
  const html = await r.text();
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta name="twitter:title" content="L\. Jonathan Haas · Director of Web Development at Penn">/);
  assert.match(html, /<meta name="twitter:description" content="[^"]+">/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/jonathan\.jawnhaas\.xyz\/og-image\.png">/);
  assert.match(html, /<meta name="twitter:image:alt" content="[^"]+">/);
});

test("homepage returns HTML with no Accept or */*", async () => {
  for (const accept of [undefined, "*/*"]) {
    const r = await call("/", accept);
    assert.match(r.headers.get("Content-Type"), /^text\/html/);
  }
});

test("homepage JSON-LD includes a contactable Organization with an address", async () => {
  const html = read("index.html");
  const source = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source, "JSON-LD script is present");
  const data = JSON.parse(source);
  const organization = data["@graph"].find((node) => node["@type"] === "Organization");
  assert.ok(organization, "Organization node is present");
  assert.equal(organization.address["@type"], "PostalAddress");
  assert.equal(organization.address.addressLocality, "Philadelphia");
  assert.equal(organization.contactPoint["@type"], "ContactPoint");
  assert.equal(organization.contactPoint.contactType, "professional inquiries");
  assert.match(organization.contactPoint.email, /@/);
});

test("about, contact, and privacy pages are substantive HTML pages", async () => {
  for (const route of ["about", "contact", "privacy"]) {
    const r = await call(`/${route}/`, "text/html");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("Content-Type"), /^text\/html/);
    const html = await r.text();
    const visibleText = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    assert.ok(visibleText.length >= 500, `${route} page has at least 500 visible characters`);
  }
});

test("each content page has a Markdown twin", async () => {
  for (const route of ["about", "contact", "privacy"]) {
    const r = await call(`/${route}.md`, "text/markdown");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("Content-Type"), /^text\/markdown/);
    assert.match(await r.text(), /^# /);
  }
});

test("missing page returns a Markdown 404 for agents", async () => {
  const r = await call("/some-path-that-does-not-exist", "text/markdown");
  assert.equal(r.status, 404);
  assert.match(r.headers.get("Content-Type"), /^text\/markdown/);
  const body = await r.text();
  assert.ok(body.length >= 20);
  assert.match(body, /\/llms\.txt/);
  assert.match(body, /\/sitemap\.xml/);
});

test("missing page returns the HTML 404 for browsers", async () => {
  const r = await call("/some-path-that-does-not-exist", "text/html");
  assert.equal(r.status, 404);
  assert.match(r.headers.get("Content-Type"), /^text\/html/);
  assert.match(await r.text(), /Page not found/);
});

test("other files pass through untouched", async () => {
  const r = await call("/llms.txt", "text/markdown");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Vary"), null);
});

test("HEAD on homepage with Markdown has headers and no body", async () => {
  const r = await call("/", "text/markdown", "HEAD");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /^text\/markdown/);
  assert.equal(await r.text(), "");
});

test("Accept parsing respects q-values", () => {
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(prefersMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0"), false);
  assert.equal(prefersMarkdown("*/*"), false);
  assert.equal(prefersMarkdown(""), false);
});

test("Worker entry gives the same answers as the Pages middleware", async () => {
  const { default: worker } = await import("../src/worker.js");
  const env = { ASSETS: { fetch: (r) => serve(typeof r === "string" || r instanceof URL ? String(r) : r.url) } };
  const md = await worker.fetch(new Request("https://jonathan.jawnhaas.xyz/", { headers: { Accept: "text/markdown" } }), env);
  assert.match(md.headers.get("Content-Type"), /^text\/markdown/);
  assert.match(md.headers.get("Vary"), /Accept/);
  const missing = await worker.fetch(new Request("https://jonathan.jawnhaas.xyz/nope", { headers: { Accept: "text/markdown" } }), env);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /404: page not found/);
});
