import { test } from "node:test";
import assert from "node:assert/strict";
import { CodexRunnerAdapter, modelArgs } from "../../src/runners/codex/adapter.js";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a provider catalog in CODEX_HOME/catalogs is passed only for that provider", () => {
  const home = mkdtempSync(join(tmpdir(), "codex-home-"));
  mkdirSync(join(home, "catalogs"));
  writeFileSync(join(home, "catalogs", "deepseek.json"), "{\"models\":[]}");
  const withCatalog = modelArgs("deepseek/deepseek-flash", "--model", home);
  const catalogArg = withCatalog[withCatalog.indexOf('model_provider="deepseek"') + 2];
  assert.match(catalogArg, /^model_catalog_json=".*catalogs\/deepseek\.json"$/);
  assert.equal(modelArgs("other/model-x", "--model", home).some((arg) => arg.startsWith("model_catalog_json")), false);
  assert.deepEqual(modelArgs("gpt-6.2-sol", "--model", home), ["--model", "gpt-6.2-sol"]);
});

test("a provider-prefixed model selects that Codex model provider", () => {
  assert.deepEqual(modelArgs("deepseek/deepseek-flash"), ["-c", 'model_provider="deepseek"', "--model", "deepseek-flash"]);
  assert.deepEqual(modelArgs("gpt-6.2-sol"), ["--model", "gpt-6.2-sol"]);
  assert.deepEqual(modelArgs(null), []);
});

test("start, resume and side-chat arguments carry the provider", () => {
  const runner = new CodexRunnerAdapter();
  const start = runner.startArgs({ cwd: "/repo", sandbox: "workspace-write", model: "deepseek/deepseek-flash", reasoningEffort: "max", skipGitRepoCheck: false });
  assert.ok(start.includes('model_provider="deepseek"'));
  assert.equal(start[start.indexOf("--model") + 1], "deepseek-flash");
  assert.ok(start.includes('model_reasoning_effort="max"'));
  const resume = runner.resumeArgs({ sandbox: "workspace-write", model: "deepseek/deepseek-flash", reasoning_effort: "high", thread_id: "t-1" });
  assert.ok(resume.includes('model_provider="deepseek"'));
  const side = runner.forkSideArgs({ forkThreadId: null, workerThreadId: "t-1", model: "deepseek/deepseek-flash" });
  assert.ok(side.includes('model_provider="deepseek"'));
});
