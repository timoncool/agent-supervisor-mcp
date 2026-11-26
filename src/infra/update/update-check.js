// What version is installed and where it came from. The installed copy is
// described from disk only; nothing is fetched.
import { runGit } from "../git.js";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "agent-supervisor-mcp";
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));

export const INSTALL_COMMAND = "git pull in the fork checkout";

// "1.2.3" -> [1,2,3]; a prerelease tag sorts below the release it precedes.
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(text ?? "").trim());
  if (!match) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] ?? null };
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    if (left.parts[i] !== right.parts[i]) return left.parts[i] < right.parts[i] ? -1 : 1;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;
  return left.prerelease < right.prerelease ? -1 : 1;
}

// What is actually on disk: the version from package.json, plus whichever
// provenance is available - npm's recorded integrity for a global install,
// the HEAD commit for a git checkout.
// A copy that npx fetched lives under npm's cache (.../_npx/<hash>/...).
// npx resolves `latest` on every start, so such a copy must never be
// auto-installed over a global one.
export function isNpxPath(path) {
  return String(path).split(/[\\/]/).includes("_npx");
}

// Who put this copy here. Pure, so it can be tested on made-up paths.
//   git  - a checkout (also what `npm link` resolves to, since node follows
//          the symlink before import.meta.url is set)
//   npx  - npm's exec cache; npx refreshes it by itself
//   npm  - a directory npm installed, global or project-local
export function installSource(root, { exists = existsSync } = {}) {
  if (exists(join(root, ".git"))) return "git";
  if (isNpxPath(root)) return "npx";
  if (basename(dirname(root)) === "node_modules") return "npm";
  return "unknown";
}

export function installedPackage() {
  const info = { name: PACKAGE_NAME, version: packageJson.version, path: packageRoot, integrity: null, commit: null, source: installSource(packageRoot) };
  // A project-local install records the package's integrity in the hidden
  // lockfile one level up. A global install has no such record (each global
  // package is its own root), so integrity stays null and only the version
  // is compared.
  const lockPath = join(packageRoot, "..", ".package-lock.json");
  if (info.source === "npm" && existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      const entry = lock.packages?.[`node_modules/${PACKAGE_NAME}`];
      if (entry?.integrity) info.integrity = entry.integrity;
    } catch {
      // unreadable lock: integrity stays unknown
    }
  }
  if (info.source === "git") {
    try {
      info.commit = runGit(packageRoot, ["rev-parse", "HEAD"], { timeout: 5000, stderr: "ignore" });
    } catch {
      // a checkout without a usable git: still a checkout
    }
  }
  return info;
}

// Pure: given what is installed and what the registry said, what to tell.
export function evaluateUpdate(installed, registry, { source, error }) {
  const cmp = registry ? compareVersions(installed.version, registry.latest.version) : null;
  const updateAvailable = cmp !== null && cmp < 0;
  const expected = registry?.versions?.[installed.version]?.integrity ?? null;
  const integrityMatches = installed.integrity && expected ? installed.integrity === expected : null;
  let notice = null;
  if (updateAvailable) {
    notice = `agent-supervisor-mcp ${installed.version} is installed but ${registry.latest.version} is published. Run \`${INSTALL_COMMAND}\` and restart the MCP client.`;
  } else if (integrityMatches === false) {
    notice = `The installed agent-supervisor-mcp ${installed.version} does not match the published tarball (integrity differs). Reinstall with \`${INSTALL_COMMAND}\`.`;
  }
  return {
    checked_at: new Date().toISOString(),
    source,
    error: error ?? null,
    installed: { version: installed.version, integrity: installed.integrity, commit: installed.commit, source: installed.source, path: installed.path },
    latest: registry?.latest ?? null,
    update_available: updateAvailable,
    integrity_matches: integrityMatches,
    install_command: INSTALL_COMMAND,
    notice
  };
}

// This fork never contacts a package registry: updates are pulled from git by
// hand. The answer describes only what is on disk.
export async function checkForUpdate() {
  return evaluateUpdate(installedPackage(), null, { source: "local", error: null });
}

// The small object that rides along in tool results. Null when there is
// nothing to say, so the common case costs no bytes.
export function updateNotice(result) {
  if (!result || !result.notice) return null;
  return {
    update_available: result.update_available,
    installed_version: result.installed.version,
    latest_version: result.latest?.version ?? null,
    integrity_matches: result.integrity_matches,
    install_command: result.install_command,
    notice: result.notice
  };
}
