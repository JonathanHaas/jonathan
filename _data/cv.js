// Eleventy global data: the CV sections on the homepage come from resume.json.
import { readFileSync } from "node:fs";
import { cvView } from "../src/resume-view.js";

export default function () {
  const resume = JSON.parse(readFileSync(new URL("../resume.json", import.meta.url), "utf8"));
  return cvView(resume);
}
