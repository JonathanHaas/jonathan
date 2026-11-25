// Builds /cv.md from resume.json, so the Markdown CV and the homepage share one source.
import { readFileSync } from "node:fs";
import { toMarkdown } from "./src/resume-view.js";

export const data = { permalink: "cv.md", eleventyExcludeFromCollections: true };

export function render() {
  const resume = JSON.parse(readFileSync(new URL("./resume.json", import.meta.url), "utf8"));
  return toMarkdown(resume);
}
