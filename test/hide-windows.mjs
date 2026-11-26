// Preloaded with `node --import` on Windows: every child process the tests start
// gets windowsHide, so a test run does not flash a console window per spawn.
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

if (process.platform === "win32") {
  const hide = (options) => (options && typeof options === "object" ? { windowsHide: true, ...options } : { windowsHide: true });
  const wrapOptionsAt = (name, index) => {
    const original = childProcess[name];
    childProcess[name] = function hidden(...args) {
      if (typeof args[index] === "function" || args.length <= index) args.splice(index, 0, hide(undefined));
      else args[index] = hide(args[index]);
      return original.apply(this, args);
    };
  };
  const withArgs = (name) => {
    const original = childProcess[name];
    childProcess[name] = function hidden(file, ...rest) {
      if (Array.isArray(rest[0]) || rest[0] == null) {
        const argv = rest[0] ?? [];
        const opts = typeof rest[1] === "function" ? undefined : rest[1];
        const tail = typeof rest[1] === "function" ? rest.slice(1) : rest.slice(2);
        return original.call(this, file, argv, hide(opts), ...tail);
      }
      if (typeof rest[0] === "function") return original.call(this, file, [], hide(undefined), ...rest);
      return original.call(this, file, [], hide(rest[0]), ...rest.slice(1));
    };
  };
  const originalExecFile = childProcess.execFile;
  const originalExec = childProcess.exec;
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "fork"]) withArgs(name);
  for (const name of ["exec", "execSync"]) wrapOptionsAt(name, 1);
  // promisify() of execFile/exec must still resolve { stdout, stderr }.
  const execFileAsync = originalExecFile[promisify.custom];
  childProcess.execFile[promisify.custom] = (file, args, options) => Array.isArray(args) || args == null
    ? execFileAsync(file, args ?? [], hide(options))
    : execFileAsync(file, [], hide(args));
  const execAsync = originalExec[promisify.custom];
  childProcess.exec[promisify.custom] = (command, options) => execAsync(command, hide(options));
  syncBuiltinESMExports();
}
