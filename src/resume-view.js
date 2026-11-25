// Turns resume.json (JSON Resume schema, https://jsonresume.org/schema) into
// what the homepage CV sections and cv.md need. Pure functions, no I/O, so
// Eleventy (_data/cv.js, cv.md.11ty.js) and the tests share one source.

// "2013" -> "2013"; "2013-04" -> "2013". The site shows years only.
export const year = (date) => (date ? String(date).slice(0, 4) : "");

// "2016" + "2022" -> "2016–2022"; no end date -> "2016–Present".
export const range = (start, end) => `${year(start)}–${end ? year(end) : "Present"}`;

// Group consecutive work entries at the same employer, keeping file order.
// One employer with several titles (Penn) becomes one group with a title ladder.
export function groupWork(work = []) {
  const groups = [];
  for (const entry of work) {
    const job = { ...entry }; // copy, so the caller's resume isn't changed
    const last = groups[groups.length - 1];
    if (last && last.name === job.name) last.roles.push(job);
    else groups.push({ name: job.name, location: job.location, url: job.url, roles: [job] });
  }
  for (const g of groups) {
    const starts = g.roles.map((r) => year(r.startDate)).filter(Boolean).sort();
    const current = g.roles.some((r) => !r.endDate);
    const ends = g.roles.map((r) => year(r.endDate)).filter(Boolean).sort();
    g.dates = `${starts[0]}–${current ? "Present" : ends[ends.length - 1]}`;
    g.city = (g.location || "").split(",")[0].trim();
    g.highlights = g.roles.flatMap((r) => r.highlights || []);
    for (const r of g.roles) {
      r.dates = range(r.startDate, r.endDate);
      r.current = !r.endDate;
    }
  }
  return groups;
}

// The view model the homepage template uses.
export function cvView(resume) {
  const [main, ...earlier] = groupWork(resume.work);
  return {
    basics: resume.basics,
    main,
    // Earlier employers each show one line: name, title, years.
    earlier: earlier.flatMap((g) => g.roles.map((r) => ({ name: g.name, position: r.position, dates: r.dates }))),
    skills: (resume.skills || []).map((s) => ({ name: s.name, text: (s.keywords || []).join(", ") })),
    education: (resume.education || []).map((e) => ({
      title: [e.studyType, e.area].filter(Boolean).join(" in "),
      institution: e.institution,
      dates: range(e.startDate, e.endDate),
    })),
    projects: resume.projects || [],
  };
}

// cv.md: the CV as plain Markdown for agents and readers.
export function toMarkdown(resume) {
  const v = cvView(resume);
  const b = v.basics;
  const loc = b.location || {};
  const github = (b.profiles || []).find((p) => p.network === "GitHub");
  const contact = [[loc.city, loc.region].filter(Boolean).join(", "), b.email, github?.url, b.url?.replace(/\/$/, "")]
    .filter(Boolean)
    .join(" · ");

  const out = [`# ${b.name}`, "", contact, "", b.summary, "", "## Experience", ""];
  out.push(`### ${v.main.name} — ${v.main.location} · ${v.main.dates}`, "");
  for (const r of v.main.roles) out.push(`- ${r.position} (${r.dates})`);
  if (v.main.highlights.length) {
    out.push("", "Highlights:", "");
    for (const h of v.main.highlights) out.push(`- ${h}`);
  }
  if (v.earlier.length) {
    out.push("", "### Earlier experience", "");
    for (const e of v.earlier) out.push(`- ${e.position}, ${e.name} (${e.dates})`);
  }
  if (v.projects.length) {
    out.push("", "## Selected Projects", "");
    for (const p of v.projects) out.push(p.url ? `${p.description.replace(/\.$/, "")}: ${p.url}` : p.description);
  }
  out.push("", "## Skills", "");
  for (const s of v.skills) out.push(`- **${s.name}:** ${s.text}`);
  out.push("", "## Education", "");
  for (const e of v.education) out.push(`**${e.title}**, ${e.institution} · ${e.dates}`);
  out.push("", `Machine-readable version (JSON Resume): ${b.url?.replace(/\/$/, "")}/resume.json`, "");
  return out.join("\n");
}
