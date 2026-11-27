import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { test } from "node:test";
import { fakeCodex, repoRoot, waitFor, waitForRunHostExit, withMcp } from "./helpers.js";

const cli = join(repoRoot, "src", "interface", "bin", "cli.js");

function invoke(env, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  return result;
}

test("CLI validates arguments, accepts both sources, and preserves MCP text and error status", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "supervisor-cli-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const env = { SUPERVISOR_HOME: home, AGENT_SUPERVISOR_NO_UPDATE_CHECK: "1" };

  const poll = invoke(env, "poll_workers");
  assert.equal(poll.status, 0, poll.stderr || poll.stdout);
  assert.deepEqual(JSON.parse(poll.stdout).workers, []);

  const unknown = invoke(env, "nope");
  assert.equal(unknown.status, 2);
  assert.deepEqual(JSON.parse(unknown.stdout), { error: "unknown_tool" });

  const extra = invoke(env, "poll_workers", "--args", '{"unexpected":true}');
  assert.equal(extra.status, 2);
  assert.equal(JSON.parse(extra.stdout).error, "invalid_arguments");
  assert.match(JSON.parse(extra.stdout).message, /unexpected/);

  const args = { task_id: "missing" };
  const argsFile = join(home, "tool args.json");
  await writeFile(argsFile, JSON.stringify(args));
  const missing = invoke(env, "get_worker", "--args-file", argsFile);
  assert.equal(missing.status, 1);
  await withMcp(env, async ({ client }) => {
    const response = await client.callTool({ name: "get_worker", arguments: args });
    assert.equal(response.isError, true);
    assert.equal(missing.stdout, `${response.content[0].text}\n`);
  });

  const help = invoke(env, "get_worker", "--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /get_worker: One worker/);
  assert.match(help.stdout, /Arguments: task_id, include/);
});

test("CLI probe reads show per-command output tails and the full run log path", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "supervisor-cli-probe-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "source");
  await mkdir(cwd);
  const home = join(root, "store");
  const env = {
    SUPERVISOR_HOME: home, AGENT_SUPERVISOR_NO_UPDATE_CHECK: "1",
    CODEX_BIN: fakeCodex, FAKE_CODEX_SCENARIO: "failing-command"
  };
  const args = { cwd, workspace: { kind: "scratch" }, owned_paths: [], probe_commands: ["npm test", "echo done"] };
  const started = invoke(env, "preflight_worker", "--args", JSON.stringify(args));
  assert.equal(started.status, 0, started.stderr || started.stdout);
  const receipt = JSON.parse(started.stdout);
  assert.equal(receipt.preflight.status, "running");
  assert.ok(isAbsolute(receipt.run_log));

  await withMcp(env, async ({ call }) => {
    await waitFor(call, receipt.id, (task) => task.exit_code !== null);
  });
  await waitForRunHostExit(home, receipt.id);

  const checked = invoke(env, "get_worker", "--args", JSON.stringify({ task_id: receipt.id, include: ["preflight"] }));
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  const verdict = JSON.parse(checked.stdout);
  assert.equal(verdict.run_log, receipt.run_log);
  const outputs = Object.fromEntries(verdict.probes.map((probe) => [probe.command, probe.output_tail]));
  const log = await readFile(verdict.run_log, "utf8");
  const fullOutput = `${"line\n".repeat(80)}npm ERR! Test failed.  See above for more details.\n`;
  assert.ok(log.includes(JSON.stringify(fullOutput)));
  assert.equal(outputs["npm test"], fullOutput.trimEnd().split("\n").slice(-40).join("\n"));
  assert.equal(outputs["echo done"], "done");
});
