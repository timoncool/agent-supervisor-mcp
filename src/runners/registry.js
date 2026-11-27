// Finds a built-in runner or loads the file named by
// AGENT_SUPERVISOR_RUNNER_<NAME> the first time that runner is requested.
import { assertRunner } from "./contract.js";
import { claudeRunner } from "./claude/adapter.js";
import { codexRunner } from "./codex/adapter.js";
import { pathToFileURL } from "node:url";

export const DEFAULT_RUNNER = "codex";
const runners = new Map([[codexRunner.name, assertRunner(codexRunner, "codex")], [claudeRunner.name, assertRunner(claudeRunner, "claude")]]);

export const runnerNames = () => [...runners.keys()];

// For code that already has a task: the runner was loaded when it was dispatched
// in this process, or is loaded by loadRunner at the entry that reads the task.
export function getRunner(name = DEFAULT_RUNNER) {
  const runner = runners.get(name ?? DEFAULT_RUNNER);
  if (!runner) throw Object.assign(new Error(`runner "${name}" is not loaded`), { code: "runner_not_loaded" });
  return runner;
}

export const runnerOf = (task) => getRunner(task?.worker ?? DEFAULT_RUNNER);

function externalSource(envName) {
  const fromEnv = process.env[envName]?.trim();
  return fromEnv ? { specifier: pathToFileURL(fromEnv).href, label: fromEnv } : null;
}

export async function loadRunner(name = DEFAULT_RUNNER) {
  const wanted = name ?? DEFAULT_RUNNER;
  if (runners.has(wanted)) return runners.get(wanted);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(wanted)) throw Object.assign(new Error(`"${wanted}" is not a runner name`), { code: "runner_unknown" });
  const envName = `AGENT_SUPERVISOR_RUNNER_${wanted.toUpperCase().replace(/-/g, "_")}`;
  const source = externalSource(envName);
  if (!source) throw Object.assign(new Error(`runner "${wanted}" is not available: set ${envName} to a runner file. Built in: ${codexRunner.name}, ${claudeRunner.name}`),
    { code: "runner_unknown" });
  const { specifier, label } = source;
  let loaded;
  try {
    loaded = await import(specifier);
  } catch (error) {
    throw Object.assign(new Error(`runner "${wanted}" is not available: could not load ${label} (${error.message.split("\n")[0]}). Built in: ${runnerNames().join(", ")}`),
      { code: "runner_unknown" });
  }
  const runner = assertRunner(loaded.runner ?? loaded.default, label);
  if (runner.name !== wanted) throw Object.assign(new Error(`${label} exports a runner named "${runner.name}", not "${wanted}"`), { code: "runner_unknown" });
  runners.set(wanted, runner);
  return runner;
}
