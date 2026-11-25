# jonathan.jawnhaas.xyz

Personal resume site for L. Jonathan Haas. Live at [jonathan.jawnhaas.xyz](https://jonathan.jawnhaas.xyz/).

## Stack

| Layer | Tool |
|---|---|
| Static site generator | [Eleventy](https://www.11ty.dev/) (v3) |
| Templates | Nunjucks (`.njk`) |
| Resume data | [JSON Resume](https://jsonresume.org/) schema (`resume.json`) |
| Hosting | Cloudflare Worker with static asset binding |
| Deployment | Cloudflare Workers Builds (auto-deploys on push to `main`) |

## Architectural decisions

### Eleventy over Jekyll or Hugo

Jekyll was the default for personal sites for years, mainly because GitHub Pages built it automatically. That advantage is gone now that every hosting platform has first-class Git integration. Jekyll also requires a Ruby environment, which is an extra dependency to maintain and a weaker target for AI-assisted development. Hugo is fast but uses Go templates, which are harder to work with.

Eleventy runs on Node.js, keeps configuration in JavaScript, and is deliberately unopinionated — you opt into the parts you need. That flexibility makes it a better fit for a site with a custom data pipeline and no framework lock-in. AI models also generate Eleventy/Nunjucks code reliably on the first try.

### JSON Resume schema for data

`resume.json` follows the [JSON Resume](https://jsonresume.org/) open schema. The key benefit is separation of content from presentation: the JSON file is the canonical record of work history, education, and skills. The templates render it; they don't store it. This means:

- Updating the CV means editing one structured file, not hunting through HTML
- The same data drives the homepage, the downloadable CV (via `cv.md.11ty.js`), and the machine-readable endpoint at `/resume.json`
- The schema is well-understood by AI tools, making content updates safe to delegate

`src/resume-view.js` transforms the raw schema into the view model the templates use. It's a pure function with no I/O, so it's testable in isolation and shared between the Eleventy build and the Worker.

### Nunjucks for templates

Eleventy supports many template languages. Nunjucks was chosen here because it's the most fully-featured option Eleventy ships with — it supports conditionals, loops, includes, macros, and filters without additional plugins. It's close enough to Jinja2 and Liquid that it transfers well across projects, and AI models generate it correctly without much hand-holding. The localization conditionals (`{% if lang == "es" %}`) throughout the header and footer are a good example of where the expressiveness helps.

### Cloudflare Worker with static assets

The site is hosted as a Cloudflare Worker rather than a plain static site. The Worker handles content negotiation: when a request comes in with `Accept: text/markdown`, it serves the Markdown version of the page instead of HTML. This lets AI agents and tools read the content directly without parsing HTML. All other requests fall through to the static asset binding, so the runtime overhead is zero for normal browser visits.

The `_headers` file configures response headers for all routes — security headers, content types for the alternative formats (`/index.md`, `/resume.json`, `/llms.txt`, `/agent.json`), and cache control for the PDF.

### Translations as separate files

Spanish (`/es/`) and Mandarin Simplified (`/zh/`) are maintained as separate Eleventy templates with their own resume JSON files, rather than using an i18n plugin or runtime translation service. The tradeoff is explicit: more files to keep in sync when content changes, but zero build-time complexity, no extra dependencies, and complete control over how each language reads.

Job titles and company names stay in English because that's standard practice on multilingual professional resumes — the audience for a resume understands English job titles regardless of their language.

### Security headers and CSP

`_headers` delivers security headers at the edge via Cloudflare. Key decisions:

- **`frame-ancestors 'none'`** in the CSP replaces `X-Frame-Options` — it's the modern equivalent and supported by every browser that matters
- **SHA-256 hash in `script-src`** instead of `'unsafe-inline'` — the site has one inline script (the JSON-LD structured data block). Rather than opening up all inline scripts, the CSP allows only the exact hash of that block. If the JSON-LD changes, the hash needs to be regenerated (see below)
- **`upgrade-insecure-requests`** upgrades any mixed-content HTTP sub-requests to HTTPS at the browser level, as a belt-and-suspenders measure alongside HSTS

### AI agent discovery

Three files make the site readable to AI agents without scraping HTML:
- `/llms.txt` — plain text summary of the site, following the emerging [llms.txt](https://llmstxt.org/) convention
- `/agent.json` — structured manifest describing the site's capabilities and endpoints
- `/cv.md` — the full CV as clean Markdown, generated from `resume.json` at build time

All three are linked from `<head>` so crawlers can find them, and the Worker serves them with the correct `Content-Type` headers.

## How it works

`resume.json` is the single source of truth for all CV content. The data pipeline is:

```
resume.json → _data/cv.js → src/resume-view.js → Eleventy templates
```

For translations:

```
resume_es.json → _data/cv_es.js → es/index.html
resume_zh.json → _data/cv_zh.js → zh/index.html
```

## Maintenance notes

**When you update CV content:** apply the same change to `resume_es.json` and `resume_zh.json` to keep translations in sync.

**When you edit the JSON-LD block in `_includes/jsonld.njk`:** regenerate the CSP hash and update `_headers`:

```sh
curl -s https://jonathan.jawnhaas.xyz/ \
  | sed -n '/<script type="application\/ld+json">/,/<\/script>/p' \
  | sed '1d;$d' \
  | openssl dgst -sha256 -binary | base64
```

## Dev

```sh
npm install
npm run dev      # local dev server with live reload
npm run build    # production build → dist/
npm test         # build + run tests
```

## Project structure

```
_data/              Eleventy global data (cv.js, cv_es.js, cv_zh.js)
_includes/
  base.njk          Shared HTML layout — all pages inherit from this
  jsonld.njk        JSON-LD structured data include (shared across pages)
  header.njk        Site header with language switcher
  footer.njk        Site footer
es/                 Spanish page template
zh/                 Mandarin (Simplified) page template
functions/          Cloudflare Pages Functions (_middleware.js)
src/                Worker entry point and resume-view transform
dist/               Build output (gitignored)
resume.json         CV data (JSON Resume schema)
resume_es.json      CV data — Spanish translation
resume_zh.json      CV data — Mandarin Simplified translation
site.css            All styles
_headers            Cloudflare response headers (security, CSP, content types)
wrangler.jsonc      Cloudflare Workers config
```
