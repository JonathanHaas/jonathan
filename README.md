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

## How it works

`resume.json` is the single source of truth for all CV content. The data pipeline is:

```
resume.json → _data/cv.js → src/resume-view.js → Eleventy templates
```

`src/resume-view.js` transforms the JSON Resume schema into the view model the templates use. It's a pure function with no I/O, so it's shared between the Eleventy build and the tests.

The Cloudflare Worker (`src/worker.js`) sits in front of the static assets to handle content negotiation — serving pages as Markdown to AI agents that request `text/markdown`.

## Translations

Spanish (`/es/`) and Mandarin Simplified (`/zh/`) versions are maintained as separate Eleventy templates, each backed by their own resume JSON file:

```
resume_es.json → _data/cv_es.js → es/index.html
resume_zh.json → _data/cv_zh.js → zh/index.html
```

Job titles and company names stay in English; prose, section headings, and UI strings are translated.

**When you update content:** apply the same change to `resume_es.json` and `resume_zh.json` to keep translations in sync.

**CSP note:** `_headers` contains a SHA-256 hash for the inline JSON-LD script in `index.html`. If you edit the JSON-LD block, regenerate the hash:

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
_data/          Eleventy global data (cv.js, cv_es.js, cv_zh.js)
_includes/      Nunjucks partials (header.njk, footer.njk)
es/             Spanish page template
zh/             Mandarin (Simplified) page template
functions/      Cloudflare Pages Functions (_middleware.js)
src/            Worker entry point and resume-view transform
dist/           Build output (gitignored)
resume.json     CV data (JSON Resume schema)
resume_es.json  CV data — Spanish translation
resume_zh.json  CV data — Mandarin Simplified translation
site.css        All styles
_headers        Cloudflare response headers (security, CSP, content types)
wrangler.jsonc  Cloudflare Workers config
```
