#!/usr/bin/env node
/**
 * Run a command with leading `NAME=value` arguments set in its environment, shell-style, so npm scripts
 * can set a build var (`NITRO_PRESET=node-server`) on Windows too. They win over the process environment.
 */
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { fileURLToPath } from "node:url";

/** Split leading `NAME=value` args off the command. */
export function splitEnvArgs(argv) {
  const env = {};
  let i = 0;
  for (; i < argv.length; i++) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(argv[i]);
    if (!m) break;
    env[m[1]] = m[2];
  }
  return { env, argv: argv.slice(i) };
}

/**
 * Translate a child's `exit` `(code, signal)` into this process's exit status.
 *
 * Do not re-raise the signal with `process.kill(process.pid, signal)`: under
 * qemu-user (amd64 image builds on an arm host) a self-directed signal is
 * routinely delivered as SIGSEGV to the wrong process, which takes down the
 * test worker and fails the image build. `128 + signo` is what a shell reports
 * for a signal-killed command, so a cancelled `vite build` is still a failure.
 */
export function exitStatusFromChild(code, signal) {
  if (signal) {
    const signo = osConstants.signals[signal];
    return 128 + (typeof signo === "number" ? signo : 1);
  }
  return code ?? 1;
}

/**
 * Whether `moduleUrl` is the script node was asked to run.
 *
 * Both sides are resolved through symlinks: node realpaths `import.meta.url`
 * but leaves `process.argv[1]` as typed, so comparing them raw makes a CLI
 * launched through a symlinked path (`/tmp` on macOS) a silent no-op.
 */
export function isMainModule(moduleUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === fileURLToPath(moduleUrl);
  } catch {
    return false;
  }
}

function main(argv) {
  const { env: assigned, argv: rest } = splitEnvArgs(argv);
  const [command, ...args] = rest;
  if (!command) {
    console.error("usage: node scripts/with-app-env.mjs [NAME=value…] <command> [args…]");
    process.exit(2);
  }
  const env = { ...process.env, ...assigned };
  const child = spawn(command, args, { stdio: "inherit", env });
  // The dev server is long-running and is stopped by signalling this wrapper.
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (err) => {
    console.error(`[with-app-env] failed to run ${command}:`, err?.message || err);
    process.exit(127);
  });
  child.on("exit", (code, signal) => {
    process.exit(exitStatusFromChild(code, signal));
  });
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
