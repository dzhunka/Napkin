/**
 * The watched development server — the widget rebuilt by `vite build --watch`
 * and Next.js serving both the site and `/mcp` — plus the process cleanup the
 * host launchers share. `pnpm dev:server` runs it directly.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function collectProcessTree(pid, seen = new Set()) {
  if (!Number.isInteger(pid) || pid <= 0 || seen.has(pid)) return [];
  seen.add(pid);
  let children = [];
  try {
    children = execFileSync("pgrep", ["-P", String(pid)], { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter((child) => Number.isInteger(child) && child > 0);
  } catch {
    // no children
  }
  const tree = children.flatMap((child) => collectProcessTree(child, seen));
  tree.push(pid);
  return tree;
}

export async function stopProcessTree(pid) {
  if (!pidAlive(pid)) return;
  const tree = collectProcessTree(pid);
  for (const member of tree) {
    try {
      process.kill(member, "SIGTERM");
    } catch {
      // already exited
    }
  }
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline && tree.some(pidAlive)) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (const member of collectProcessTree(pid)) {
    if (!pidAlive(member)) continue;
    try {
      process.kill(member, "SIGKILL");
    } catch {
      // already exited
    }
  }
}

/**
 * A `next dev` worker outlives a killed parent and then holds the port, so the
 * next run silently starts on a different one. `.next/dev/lock` records it.
 */
export async function stopLeftoverDevServer() {
  let lock;
  try {
    lock = JSON.parse(await readFile(path.join(repositoryRoot, ".next", "dev", "lock"), "utf8"));
  } catch {
    return;
  }
  const pid = Number(lock.pid);
  if (!pidAlive(pid)) return;
  let command = "";
  try {
    command = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
  } catch {
    return;
  }
  if (!/\bnext-server\b/.test(command) && !/\bnext\s+dev\b/.test(command)) return;
  console.log(`Stopping leftover Next.js dev server (pid ${pid}).`);
  await stopProcessTree(pid);
}

export async function stopDevServer(child) {
  if (child?.pid) await stopProcessTree(child.pid);
  await stopLeftoverDevServer();
}

/**
 * Rebuilt on change by `vite build --watch`; the routes read the bundle per
 * request, so widget edits need only a fresh thread, not a restart.
 */
export function startDevServer(port) {
  return spawn(
    "npx",
    ["concurrently", "--kill-others", "--names", "widget,next", "vite build --watch", `next dev --port ${port}`],
    {
      cwd: repositoryRoot,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "inherit",
    },
  );
}

/** Any HTTP response means the server is listening — `GET /mcp` answers 405. */
export async function waitForEndpoint(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`The dev server exited with code ${child.exitCode}.`);
    }
    try {
      await fetch(url);
      return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stopLeftoverDevServer();
  const child = startDevServer(Number(process.env.PORT ?? 3000));
  const shutdown = async (code) => {
    await stopDevServer(child);
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(130));
  process.on("SIGTERM", () => void shutdown(143));
  child.once("close", (code) => process.exit(code ?? 0));
}
