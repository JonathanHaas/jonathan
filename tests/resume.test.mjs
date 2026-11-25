// Tests for resume.json (JSON Resume) and the pages built from it. Run with: npm test
// No extra packages: a small JSON Schema checker below covers the keywords the
// JSON Resume v1.0.0 schema uses (vendored in tests/fixtures).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cvView, groupWork, range, toMarkdown } from "../src/resume-view.js";

const root = new URL("../", import.meta.url);
const readSource = (f) => readFileSync(new URL(f, root), "utf8");
const readBuilt = (f) => readFileSync(new URL(`dist/${f}`, root), "utf8");
const resume = JSON.parse(readSource("resume.json"));
const schema = JSON.parse(readSource("tests/fixtures/jsonresume-schema-v1.0.0.json"));

// Minimal JSON Schema (draft-04) checker: $ref, type, properties,
// additionalProperties, items, pattern, format (email, uri). Returns error strings.
function check(value, node, path = "$", errors = []) {
  if (node.$ref) node = node.$ref.split("/").slice(1).reduce((o, k) => o[k], schema);
  const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v === "number" && Number.isInteger(v) ? "integer" : typeof v);
  if (node.type) {
    const types = [].concat(node.type);
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) {
      errors.push(`${path}: expected ${types.join("|")}, got ${actual}`);
      return errors;
    }
  }
  if (typeof value === "string") {
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(`${path}: "${value}" doesn't match ${node.pattern}`);
    if (node.format === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push(`${path}: not an email`);
    if (node.format === "uri" && !URL.canParse(value)) errors.push(`${path}: not a URI`);
  }
  if (Array.isArray(value) && node.items) value.forEach((v, i) => check(v, node.items, `${path}[${i}]`, errors));
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const props = node.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) check(v, props[k], `${path}.${k}`, errors);
      else if (node.additionalProperties === false) errors.push(`${path}.${k}: not allowed by the schema`);
      else if (typeof node.additionalProperties === "object") check(v, node.additionalProperties, `${path}.${k}`, errors);
    }
  }
  return errors;
}

test("resume.json is valid JSON Resume (schema v1.0.0)", () => {
  assert.deepEqual(check(resume, schema), []);
});

test("the schema checker catches mistakes", () => {
  const bad = { basics: { name: 1, email: "nope", profiles: [{ url: "not a url" }] }, work: [{ startDate: "May 2013" }], extra: true };
  const errors = check(bad, schema);
  assert.ok(errors.some((e) => e.startsWith("$.basics.name")));
  assert.ok(errors.some((e) => e.startsWith("$.basics.email")));
  assert.ok(errors.some((e) => e.startsWith("$.basics.profiles[0].url")));
  assert.ok(errors.some((e) => e.startsWith("$.work[0].startDate")));
  assert.ok(errors.some((e) => e.startsWith("$.extra")));
});

test("resume.json keeps private details out", () => {
  assert.equal(resume.basics.phone, undefined);
  assert.deepEqual(Object.keys(resume.basics.location).sort(), ["city", "countryCode", "region"]);
  assert.doesNotMatch(JSON.stringify(resume), /\d{3}[-. ]\d{3}[-. ]\d{4}/, "no phone numbers");
});

test("resume.json agrees with the homepage JSON-LD", () => {
  const html = readSource("index.html");
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@graph"];
  const person = graph.find((n) => n["@type"] === "ProfilePage").mainEntity;
  assert.equal(resume.basics.name, person.name);
  assert.equal(resume.basics.url, person.url);
  assert.equal(`mailto:${resume.basics.email}`, person.email);
  assert.equal(resume.basics.location.city, person.address.addressLocality);
  assert.equal(resume.basics.location.region, person.address.addressRegion);
  assert.equal(resume.basics.location.countryCode, person.address.addressCountry);
  assert.ok(resume.basics.label.startsWith(person.jobTitle));
  assert.deepEqual(resume.basics.profiles.map((p) => p.url).sort(), [...person.sameAs].sort());
  assert.equal(resume.education[0].institution, person.alumniOf.name);
  assert.equal(resume.work[0].name, person.worksFor.parentOrganization.name);
});

test("work entries group by employer with years only", () => {
  assert.equal(range("2013-04", undefined), "2013–Present");
  const groups = groupWork(resume.work);
  assert.equal(groups[0].name, "University of Pennsylvania");
  assert.equal(groups[0].dates, "2013–Present");
  assert.equal(groups[0].city, "Philadelphia");
  assert.deepEqual(groups[0].roles.map((r) => r.current), [true, false, false]);
  assert.equal(cvView(resume).earlier.length, resume.work.length - 3);
  assert.equal(resume.work[0].dates, undefined, "the input isn't changed");
});

test("the homepage CV sections come from resume.json", () => {
  const src = readSource("index.html");
  // The source holds template tags, not CV text, so resume.json is the one place to edit.
  for (const text of ["Galaxy Systems", "Senior Web Developer", "Tailscale</p>"]) assert.ok(!src.includes(text), text);

  const decode = (s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  const html = decode(readBuilt("index.html"));
  const main = html.match(/<main[\s\S]*<\/main>/)[0];
  for (const job of resume.work) {
    assert.ok(main.includes(job.position), job.position);
    for (const h of job.highlights || []) assert.ok(main.includes(`<li>${h}</li>`), h);
  }
  assert.match(main, /<li class="now"><span>Director, Web Development, University Communications<\/span><span class="dates">2022–Present<\/span><\/li>/);
  assert.match(main, /<span class="dates">Philadelphia · 2013–Present<\/span>/);
  assert.match(main, /<li><span><b>GSI Commerce \/ eBay<\/b> · Senior Software Engineer<\/span><span class="dates">2012–2013<\/span><\/li>/);
  for (const s of resume.skills) assert.ok(main.includes(`<h3>${s.name}</h3><p>${s.keywords.join(", ")}</p>`), s.name);
  assert.match(main, /<div class="edu"><h3>Information Systems, Drexel University<\/h3><span class="dates">1995–2000<\/span><\/div>/);
  assert.match(html, /<link rel="alternate" type="application\/json" href="\/resume\.json"/);
});

test("cv.md is built from resume.json", () => {
  const md = readBuilt("cv.md");
  assert.equal(md, toMarkdown(resume));
  assert.ok(md.startsWith("# L. Jonathan Haas\n"));
  assert.match(md, /^Philadelphia, PA · jonathan\.haas@gmail\.com · https:\/\/github\.com\/JonathanHaas · https:\/\/jonathan\.jawnhaas\.xyz$/m);
  assert.match(md, /^- Director, Web Development, University Communications \(2022–Present\)$/m);
  assert.match(md, /^- Software Engineer, GSI Commerce \(2000–2006\)$/m);
  assert.match(md, /^- \*\*Languages:\*\* PHP, Java, JavaScript \/ Node\.js, Python, HTML\/CSS$/m);
  assert.match(md, /^\*\*Information Systems\*\*, Drexel University · 1995–2000$/m);
  assert.match(md, /resume\.json/);
  assert.doesNotMatch(md, /<[a-z]/i, "no HTML in the Markdown");
});

test("resume.json is published and listed for agents", () => {
  assert.deepEqual(JSON.parse(readBuilt("resume.json")), resume);
  assert.match(readBuilt("llms.txt"), /\(https:\/\/jonathan\.jawnhaas\.xyz\/resume\.json\)/);
  assert.match(readBuilt("sitemap.xml"), /<loc>https:\/\/jonathan\.jawnhaas\.xyz\/resume\.json<\/loc>/);
  const agent = JSON.parse(readBuilt("agent.json"));
  assert.ok(agent.capabilities.some((c) => c.endpoint === "https://jonathan.jawnhaas.xyz/resume.json"));
  assert.match(readBuilt("_headers"), /\/resume\.json\n  Content-Type: application\/json; charset=utf-8\n  Access-Control-Allow-Origin: \*/);
});
