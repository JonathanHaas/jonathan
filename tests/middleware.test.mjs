// Tests for functions/_middleware.js. Run from the repo root with: node --test
// No dependencies: Node 22+ provides Request, Response, Headers and node:test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest, prefersMarkdown } from "../functions/_middleware.js";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");
const assets = { "/": ["index.html", "text/html"], "/index.md": ["index.md", "text/markdown"], "/llms.txt": ["llms.txt", "text/plain"] };

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

test("homepage still returns HTML for browsers", async () => {
  const r = await call("/", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("Content-Type"), /^text\/html/);
  assert.match(r.headers.get("Vary"), /Accept/);
  assert.match(await r.text(), /^<!DOCTYPE html>/);
});

test("homepage returns HTML with no Accept or */*", async () => {
  for (const accept of [undefined, "*/*"]) {
    const r = await call("/", accept);
    assert.match(r.headers.get("Content-Type"), /^text\/html/);
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
