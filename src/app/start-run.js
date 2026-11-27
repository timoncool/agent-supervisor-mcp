import "./compose.js";
import { SHARED_CONSOLE_ENV, spawnProcess } from "../infra/process.js";
import { upsertTask } from "../infra/store/tasks.js";
import { compileWorkerContext } from "./context-compiler.js";
import { failedStart, MAX_RUN_HOST_PROMPT_BYTES, RUN_HOST_STARTUP_TIMEOUT_MS } from "./run-state.js";
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The MCP client may disappear at any point. A detached process owns the
// streams, exit write and acceptance until all three settle; IPC is only a
// startup handshake and never the channel carrying worker results.
export async function startTrackedRun(job) {
  if (Buffer.byteLength(String(job.prompt ?? ""), "utf8") > MAX_RUN_HOST_PROMPT_BYTES) {
    const result = failedStart(job.record, `worker prompt is too large for the detached run host IPC channel (maximum ${MAX_RUN_HOST_PROMPT_BYTES} bytes); reduce task text and move materials to context files`);
    await upsertTask(result.record);
    return result;
  }
  const compiled = await compileWorkerContext(job.record, { attempt: (job.record.run_count ?? 0) + 1 });
  job.record = {
    ...job.record,
    input_context: {
      ...job.record.input_context,
      context: compiled.sourceRefs,
      source_refs: compiled.sourceRefs,
      content_hash: compiled.contentHash,
      context_snapshot_id: compiled.snapshot.id,
      context_snapshot_tokens: compiled.snapshot.estimated_tokens,
      context_fact_count: compiled.factCount
    }
  };
  job.prompt = `${compiled.text}\n\n${job.prompt}\n\nRequired input refs (read-only): ${JSON.stringify(compiled.sourceRefs)}\nRequired contracts: ${JSON.stringify(job.record.input_context.contracts ?? [])}`;
  const hostLogPath = job.logPath.endsWith(".jsonl")
    ? job.logPath.replace(/\.jsonl$/, ".host.log")
    : `${job.logPath}.host.log`;
  if (process.platform === "win32") {
    const started = await startHostInSharedConsole(job, hostLogPath);
    if (!started.ok) await upsertTask(started.record);
    return started;
  }
  let hostLogFd;
  try {
    hostLogFd = openSync(hostLogPath, "a");
  } catch (error) {
    const result = failedStart(job.record, `cannot open run host log ${hostLogPath}: ${error.message}`);
    await upsertTask(result.record);
    return result;
  }
  let host;
  try {
    host = spawnProcess(process.execPath, [fileURLToPath(new URL("../run-host/entry.js", import.meta.url)), "--run-host"], {
      detached: true, stdio: ["ignore", hostLogFd, hostLogFd, "ipc"],
      env: process.env, windowsHide: true
    });
  } finally {
    closeSync(hostLogFd);
  }
  const started = await new Promise((resolveStart) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      host.removeAllListeners("message");
      host.removeAllListeners("exit");
      if (host.connected) host.disconnect();
      host.unref();
      resolveStart(result);
    };
    const timer = setTimeout(() => {
      host.kill();
      finish(failedStart(job.record, "run host startup timed out"));
    }, RUN_HOST_STARTUP_TIMEOUT_MS);
    host.once("message", finish);
    host.once("error", (error) => finish(failedStart(job.record, `run host startup failed: ${error.message}`)));
    host.once("exit", (code) => finish(failedStart(job.record, `run host exited before startup: ${code}`)));
    host.send(job, (error) => {
      if (error) finish(failedStart(job.record, `run host IPC failed: ${error.message}`));
    });
  });
  if (!started.ok) await upsertTask(started.record);
  return started;
}

// A detached Windows process has no console, so every console program it starts
// opens a window. `start /b` puts the run host into this process's hidden
// console and outside the job that ends this process's children with it. That
// path has no IPC channel: the job and the startup answer travel as files.
async function startHostInSharedConsole(job, hostLogPath) {
  const base = hostLogPath.replace(/\.host\.log$/, "");
  const jobPath = `${base}.job.json`;
  const ackPath = `${base}.ack.json`;
  rmSync(ackPath, { force: true });
  writeFileSync(jobPath, JSON.stringify(job));
  const entry = fileURLToPath(new URL("../run-host/entry.js", import.meta.url));
  const line = `/d /c start "" /b "${process.execPath}" "${entry}" --run-host --job-file "${jobPath}" --ack-file "${ackPath}"`;
  let hostLogFd;
  try {
    hostLogFd = openSync(hostLogPath, "a");
  } catch (error) {
    rmSync(jobPath, { force: true });
    return failedStart(job.record, `cannot open run host log ${hostLogPath}: ${error.message}`);
  }
  try {
    spawnProcess(process.env.ComSpec || "cmd.exe", [line], {
      stdio: ["ignore", hostLogFd, hostLogFd],
      env: { ...process.env, [SHARED_CONSOLE_ENV]: "1" },
      windowsVerbatimArguments: true,
      windowsHide: false
    }).unref();
  } finally {
    closeSync(hostLogFd);
  }
  const deadline = Date.now() + RUN_HOST_STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(ackPath)) {
      const answer = JSON.parse(readFileSync(ackPath, "utf8"));
      rmSync(ackPath, { force: true });
      return answer;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  rmSync(jobPath, { force: true });
  return failedStart(job.record, `run host startup timed out; host log: ${hostLogPath}`);
}
