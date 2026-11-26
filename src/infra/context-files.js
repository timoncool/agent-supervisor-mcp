// The dispatcher's context files, read from disk and handed to the worker in
// full so it can start editing without spending tool calls on reading them.
import { readFileSync } from "node:fs";

export const MAX_INLINE_CONTEXT_CHARS = 120000;

export function inlineContextFiles(entries, { maxChars = MAX_INLINE_CONTEXT_CHARS, read = (path) => readFileSync(path, "utf8") } = {}) {
  const files = (entries ?? []).map((entry) => entry.path).filter(Boolean);
  if (files.length === 0) return "";
  const blocks = [];
  const skipped = [];
  let used = 0;
  for (const path of files) {
    let body;
    try {
      body = read(path);
    } catch (error) {
      skipped.push(`${path} (unreadable: ${error.code ?? error.message})`);
      continue;
    }
    if (used + body.length > maxChars) {
      skipped.push(`${path} (over the ${maxChars}-character inline budget)`);
      continue;
    }
    used += body.length;
    blocks.push(`<file path="${path}">\n${body}\n</file>`);
  }
  const head = "Context files, included in full. Work from these; do not read them again.";
  const tail = skipped.length > 0 ? `\nNot included, read only if you need them:\n${skipped.map((line) => `- ${line}`).join("\n")}` : "";
  return `${head}\n${blocks.join("\n")}${tail}`;
}
