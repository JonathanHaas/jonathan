import { rm } from "node:fs/promises";

export default function (eleventyConfig) {
  const staticFiles = [
    "_headers",
    "agent.json",
    "resume.json",
    "*.md",
    "*.pdf",
    "*.png",
    "*.svg",
    "*.txt",
    "*.xml",
    "robots.txt",
    "site.css",
    "theme.js",
    "fonts/",
  ];

  eleventyConfig.on("eleventy.before", () => rm("dist", { recursive: true, force: true }));
  for (const file of staticFiles) eleventyConfig.addPassthroughCopy(file);
  eleventyConfig.ignores.add("*.md");

  return {
    dir: { input: ".", includes: "_includes", output: "dist" },
    htmlTemplateEngine: "njk",
  };
}
