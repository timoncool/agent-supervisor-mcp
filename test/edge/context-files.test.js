import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineContextFiles } from "../../src/infra/context-files.js";

const files = { "/repo/a.rs": "fn a() {}", "/repo/b.rs": "x".repeat(50), "/repo/c.rs": "fn c() {}" };
const read = (path) => {
  if (!(path in files)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
  return files[path];
};

test("context files are included in full", () => {
  const text = inlineContextFiles([{ path: "/repo/a.rs" }, { path: "/repo/c.rs" }], { read });
  assert.match(text, /<file path="\/repo\/a.rs">\nfn a\(\) \{\}\n<\/file>/);
  assert.match(text, /<file path="\/repo\/c.rs">/);
  assert.doesNotMatch(text, /Not included/);
});

test("files over the budget or unreadable are named, not dropped silently", () => {
  const text = inlineContextFiles([{ path: "/repo/a.rs" }, { path: "/repo/b.rs" }, { path: "/repo/gone.rs" }], { read, maxChars: 20 });
  assert.match(text, /<file path="\/repo\/a.rs">/);
  assert.match(text, /- \/repo\/b.rs \(over the 20-character inline budget\)/);
  assert.match(text, /- \/repo\/gone.rs \(unreadable: ENOENT\)/);
});

test("no context means no section", () => {
  assert.equal(inlineContextFiles([], { read }), "");
  assert.equal(inlineContextFiles(undefined, { read }), "");
});
