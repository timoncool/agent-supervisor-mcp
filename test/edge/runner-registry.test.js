import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadRunner } from "../../src/runners/registry.js";

test("an unknown runner requires an explicit runner file", async () => {
  delete process.env.AGENT_SUPERVISOR_RUNNER_REGISTRY_UNKNOWN;
  await assert.rejects(loadRunner("registry-unknown"), {
    code: "runner_unknown",
    message: /set AGENT_SUPERVISOR_RUNNER_REGISTRY_UNKNOWN to a runner file\. Built in: codex, claude/,
  });
});

test("loads the runner file named by the environment", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "runner-registry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "runner.mjs");
  await writeFile(file, `
    export const runner = {
      name: "registry-external",
      capabilities: {
        os_sandbox: false,
        resume: false,
        side_chat: false,
        tool_guard: false,
        structured_report: false,
        native_goal: false,
      },
      resolveTarget() { return "registry-fixture"; },
      capabilityPreflight() {},
      startArgs() {},
      launchArgs() {},
      toEvents() {},
      parseEvent() {},
      cancelChild() {},
      cancelPid() {},
      ownsPid() {},
    };
  `);
  process.env.AGENT_SUPERVISOR_RUNNER_REGISTRY_EXTERNAL = file;
  t.after(() => { delete process.env.AGENT_SUPERVISOR_RUNNER_REGISTRY_EXTERNAL; });
  const runner = await loadRunner("registry-external");
  assert.equal(runner.name, "registry-external");
  assert.equal(runner.resolveTarget(), "registry-fixture");
});

test("loads built-in codex without an external file", async () => {
  assert.equal((await loadRunner("codex")).name, "codex");
});
