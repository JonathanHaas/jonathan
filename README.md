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

Spanish (`/es/`) and Mandarin Simplified (`/zh/`) are maintained as separate Eleventy templates, following the directory-prefix pattern Google recommends for multilingual sites. Every page has a translated equivalent: `/es/about/`, `/zh/contact/`, and so on. The tradeoff is explicit: more files to keep in sync when content changes, but zero build-time complexity, no extra dependencies, and complete control over how each language reads.

#### All pages across all languages

| Page | English | Spanish | Mandarin Simplified |
|---|---|---|---|
| Home | `/` | `/es/` | `/zh/` |
| About | `/about/` | `/es/about/` | `/zh/about/` |
| Contact | `/contact/` | `/es/contact/` | `/zh/contact/` |
| Privacy | `/privacy/` | `/es/privacy/` | `/zh/privacy/` |

That's 12 HTML pages total. All 12 URLs are in `sitemap.xml`, along with the CV PDF and machine-readable endpoints.

#### How the language switcher and hreflang work

Interior pages set `alternateBase: /about/` (or `/contact/`, `/privacy/`) in their front matter. The base layout uses this in two ways:
1. Generates hreflang tags pointing at the correct page in each language (not just the homepage)
2. Wires the EN / ES / 中文 switcher buttons to land on the same page in the other language

Homepage variants set `hasTranslations: true` instead — the layout emits fixed hreflang URLs for the three homepage equivalents. Neither pattern requires touching any code; it's driven entirely by front matter.

#### Language-specific details

| Language | `lang` value | `<html lang>` | Font | `ogLocale` |
|---|---|---|---|---|
| English | `en` | `en` | Jost + Karla | `en_US` |
| Spanish | `es` | `es` | Jost + Karla | `es_ES` |
| Mandarin | `zh` | `zh-Hans` | Jost + Karla + Noto Sans SC | `zh_CN` |

Noto Sans SC is added only for `zh` pages — the Google Fonts request is conditional in `base.njk` to avoid loading a large CJK font on English and Spanish pages. `site.css` applies Chinese typography via the CSS `:lang()` pseudo-class rather than a body class:

```css
:lang(zh) { font-family: "Noto Sans SC", "Karla", …; }
:lang(zh) .mark, :lang(zh) nav a, :lang(zh) h1 … { font-family: "Noto Sans SC", "Jost", …; }
```

This keeps all language variants in one stylesheet. No separate CSS file or body-class swap needed for Chinese.

#### What stays in English

Homepages pull from JSON Resume data files (`resume_es.json`, `resume_zh.json`), so job titles and company names stay in English. This is standard practice for multilingual professional resumes — those terms are understood internationally and searching for translated titles is less effective. Interior pages (about, contact, privacy) are fully translated prose. The CV download button on the zh homepage notes the file is in English (`PDF · 英文版`).

#### AI discovery links — English only

The `extraLinks` front matter on the English homepage adds `<link>` tags for `/llms.txt`, `/agent.json`, `/index.md`, and `/resume.json`. These endpoints don't have translated equivalents, so the Spanish and Mandarin homepages omit `extraLinks`.

### Security headers and CSP

`_headers` delivers security headers at the edge via Cloudflare. Key decisions:

- **`frame-ancestors 'none'`** in the CSP replaces `X-Frame-Options` — it's the modern equivalent and supported by every browser that matters
- **SHA-256 hash in `script-src`** instead of `'unsafe-inline'` — the site has one inline script (the JSON-LD structured data block). Rather than opening up all inline scripts, the CSP allows only the exact hash of that block. If the JSON-LD changes, the hash needs to be regenerated (see below)
- **`upgrade-insecure-requests`** upgrades any mixed-content HTTP sub-requests to HTTPS at the browser level, as a belt-and-suspenders measure alongside HSTS

### Shared base layout

All pages inherit from `_includes/base.njk`, which renders the full HTML shell — `<head>`, header, footer — from front matter variables. Pages only contain their `<main>` block. This means head tags, hreflang, OG/Twitter meta, JSON-LD, and fonts are maintained in one place instead of being duplicated across every template.

Key front matter variables the layout reads:

| Variable | Purpose |
|---|---|
| `lang` | Drives `<html lang>`, font selection (Noto Sans SC for zh), and header/footer text |
| `title`, `description`, `canonical` | Standard head tags |
| `hasTranslations` | Adds homepage hreflang (en/es/zh/x-default) |
| `alternateBase` | Adds interior page hreflang; also wires the language switcher to the correct sibling page |
| `ogTitle`, `ogDescription`, `ogImageAlt` | Open Graph overrides (fall back to title/description) |
| `showOgProfile` | Adds `profile:first_name` / `profile:last_name` meta (home pages only) |
| `extraLinks` | Additional `<link>` tags — used on the homepage for llms.txt, agent.json, resume.json, index.md |
| `bodyClass` | `home` or `interior` — drives CSS layout variants |

### Active nav indicator

The current page is highlighted in the nav with a walnut underline. This is implemented using `aria-current="page"` on the active link — the ARIA attribute that screen readers already use to identify the current page serves double duty as the CSS hook (`nav a[aria-current="page"]`). No JavaScript, no extra classes. The language switcher uses the same pattern with `aria-current="true"` on the active language button.

A `border-bottom: 2px solid transparent` is applied to all nav links at all times so the active indicator doesn't shift the layout when it appears.

### Font loading

Fonts (Jost, Karla) are loaded from Google Fonts with `font-display: optional`. This prevents the FOUT (flash of unstyled text) that caused the fixed header to visually shift on mobile during page navigation. With `optional`, the browser uses the web font only if it's already in cache; otherwise it uses the system font and never swaps. First-time visitors see the system font; repeat visitors (and anyone who has stayed on a page long enough for fonts to cache) see Jost and Karla.

### Fixed header

The site header uses `position: fixed` rather than `position: sticky`. Sticky positioning on iOS Safari is affected by the browser chrome show/hide animation — when iOS reveals the address bar on tap, the viewport resizes and the sticky header briefly recalculates its position, producing a visible jump. Fixed positioning is locked to the viewport and immune to viewport size changes. Content is padded down to match the header height via CSS custom properties (`--header-h`), with different values at the mobile breakpoint.

### AI agent discovery

Three files make the site readable to AI agents without scraping HTML:
- `/llms.txt` — plain text summary of the site, following the emerging [llms.txt](https://llmstxt.org/) convention
- `/agent.json` — structured manifest describing the site's capabilities and endpoints
- `/cv.md` — the full CV as clean Markdown, generated from `resume.json` at build time

All three are linked from `<head>` so crawlers can find them, and the Worker serves them with the correct `Content-Type` headers.

## How it works

`resume.json` is the single source of truth for all CV content. The data pipeline is:

```
resume.json    → _data/cv.js    → index.html     (English homepage)
resume_es.json → _data/cv_es.js → es/index.html  (Spanish homepage)
resume_zh.json → _data/cv_zh.js → zh/index.html  (Mandarin homepage)
```

Interior pages (about, contact, privacy) don't use the data pipeline — they're static translated HTML templates. `src/resume-view.js` transforms the raw JSON Resume schema into the view model the templates use; it's a pure function shared between the Eleventy build and the Worker.

## Maintenance notes

**When you update CV content:** edit `resume.json` for the English homepage, then apply the same change to `resume_es.json` and `resume_zh.json` to keep the Spanish and Mandarin homepages in sync. For prose on interior pages (about, contact, privacy), edit the three corresponding templates — `about/index.html`, `es/about/index.html`, `zh/about/index.html` — directly.

**When you add a new page:** create the page at `/page-name/index.html`, then create `es/page-name/index.html` and `zh/page-name/index.html`. Add `alternateBase: /page-name/` to all three. Add nav and footer links to `_includes/header.njk` and `_includes/footer.njk` (follow the `{% if lang == "es" %}` pattern already there). Update `sitemap.xml` with all three URLs.

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
  jsonld.njk        JSON-LD structured data (shared; same hash on every page)
  header.njk        Site header with language-aware nav and language switcher
  footer.njk        Site footer with language-aware links
es/                 Spanish templates
  index.html          Homepage
  about/index.html    About
  contact/index.html  Contact
  privacy/index.html  Privacy
zh/                 Mandarin Simplified templates
  index.html          Homepage
  about/index.html    About
  contact/index.html  Contact
  privacy/index.html  Privacy
about/              English interior page
  index.html
contact/
  index.html
privacy/
  index.html
functions/          Cloudflare Pages Functions (_middleware.js)
src/                Worker entry point and resume-view transform
dist/               Build output (gitignored)
resume.json         CV data (JSON Resume schema)
resume_es.json      CV data — Spanish translation (homepage only)
resume_zh.json      CV data — Mandarin Simplified translation (homepage only)
site.css            All styles
_headers            Cloudflare response headers (security, CSP, content types)
sitemap.xml         Sitemap (all 15 URL variants)
wrangler.jsonc      Cloudflare Workers config
```
