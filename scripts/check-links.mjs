#!/usr/bin/env node
// Checks that every relative link and image source in the given markdown files resolves, and that a `#anchor` names a heading of the
// file it points to (GitHub's slug rules). Usage: node scripts/check-links.mjs [file.md ...]  (default: README.md and docs/*.md)
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXTERNAL = /^(https?:|mailto:)/;
const LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)|\bsrc="([^"]+)"|\bhref="([^"]+)"/g;

/** GitHub's heading anchor: lowercased, markup and punctuation dropped, spaces to dashes. */
const slug = (heading) =>
  heading
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");

const anchorsOf = (file) => {
  const found = new Set();
  let fenced = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("```")) fenced = !fenced;
    const heading = fenced ? null : /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) found.add(slug(heading[1]));
  }
  return found;
};

const defaultFiles = () => ["README.md", ...readdirSync(join(ROOT, "docs")).filter((f) => f.endsWith(".md")).sort().map((f) => `docs/${f}`)];
const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles();

let checked = 0;
let broken = 0;
for (const file of files) {
  const path = resolve(ROOT, file);
  const text = readFileSync(path, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const match of text.matchAll(LINK)) {
    const target = match[1] ?? match[2] ?? match[3];
    if (EXTERNAL.test(target)) continue;
    checked++;
    const [pathPart, anchor] = target.split("#");
    const dest = pathPart === "" ? path : resolve(dirname(path), decodeURIComponent(pathPart));
    const problem = !existsSync(dest) ? "missing file" : anchor && statSync(dest).isFile() && dest.endsWith(".md") && !anchorsOf(dest).has(anchor) ? "missing anchor" : null;
    if (problem === null) continue;
    broken++;
    console.log(`${problem}: ${file} -> ${target}`);
  }
}
console.log(`${checked} relative links checked in ${files.length} files, ${broken} broken`);
process.exit(broken === 0 ? 0 : 1);
