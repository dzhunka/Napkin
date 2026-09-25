/**
 * Launch an isolated Codex desktop instance with this repository installed as
 * its only local plugin, pointed at the local dev server.
 *
 * No tunnel is needed: the widget is a self-contained bundle, so the host's
 * iframe fetches nothing and plain http://127.0.0.1 is enough. See DECISIONS.md.
 *
 * The isolated state lives in a temporary directory and is removed on a clean
 * exit. Nothing in the repository is modified.
 */
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import {
  repositoryRoot,
  startDevServer,
  stopDevServer,
  stopLeftoverDevServer,
  waitForEndpoint,
} from "./dev-web.mjs";

const pluginSource = path.join(repositoryRoot, "plugins", "napkin");
const codexCli = "/Applications/ChatGPT.app/Contents/Resources/codex";
const chatGptExecutable = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const sourceCodexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), ".codex");
const sourceAuth = path.join(sourceCodexHome, "auth.json");

const port = 3100;
const localOrigin = `http://127.0.0.1:${port}`;
const mcpEndpoint = `${localOrigin}/mcp`;

// `--install-only` verifies staging and installation without launching the GUI.
const installOnly = process.argv.includes("--install-only");

const manifest = JSON.parse(await readFile(path.join(pluginSource, ".codex-plugin", "plugin.json"), "utf8"));
const pluginName = manifest.name;
const marketplaceName = `${pluginName}-local`;

const seedThreadFixturesRoot = path.join(repositoryRoot, "scripts", "fixtures");
const seedThreadPrefix = "codex-dev-seed-thread-";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited ${signal ? `from ${signal}` : `with code ${code}`}`));
    });
  });
}

/**
 * Codex installs a plugin by copying its source directory. Stage a marketplace
 * holding a copy of `plugins/napkin`, with the endpoint rewritten to the dev
 * server, so the repository's own manifests keep pointing at production.
 */
async function stageMarketplace(root) {
  const marketplaceRoot = path.join(root, "marketplace");
  const pluginRoot = path.join(marketplaceRoot, "plugin");
  await mkdir(path.join(marketplaceRoot, ".agents", "plugins"), { recursive: true });
  await cp(pluginSource, pluginRoot, { recursive: true });

  await writeFile(
    path.join(pluginRoot, ".mcp.json"),
    `${JSON.stringify({ mcpServers: { [pluginName]: { type: "http", url: mcpEndpoint } } }, null, 2)}\n`,
  );

  await writeFile(
    path.join(marketplaceRoot, ".agents", "plugins", "marketplace.json"),
    `${JSON.stringify(
      {
        name: marketplaceName,
        interface: { displayName: `${pluginName} (local)` },
        plugins: [
          {
            name: pluginName,
            source: { source: "local", path: "./plugin" },
            policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return marketplaceRoot;
}

/**
 * Seed threads are real Codex conversations captured into
 * `scripts/fixtures/codex-dev-seed-thread-*`. Capture your own with
 * `pnpm capture-thread`.
 */
async function listSeedThreadFixtures() {
  let entries;
  try {
    entries = await readdir(seedThreadFixturesRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const fixtures = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(seedThreadPrefix)) continue;
    const dir = path.join(seedThreadFixturesRoot, entry.name);
    fixtures.push({
      name: entry.name,
      rolloutPath: path.join(dir, "rollout.jsonl"),
      meta: JSON.parse(await readFile(path.join(dir, "meta.json"), "utf8")),
    });
  }

  fixtures.sort((a, b) => a.name.localeCompare(b.name));
  return fixtures;
}

/**
 * Codex finds a thread through three files: the rollout under `sessions/`, a
 * line in `session_index.jsonl`, and an entry in global state. Write all three
 * and the fixture shows up in the thread list, ready to continue.
 */
async function writeGlobalState(isolatedCodexHome, threads = []) {
  await writeFile(
    path.join(isolatedCodexHome, ".codex-global-state.json"),
    JSON.stringify({
      "projectless-thread-ids": threads.map((thread) => thread.id),
      "thread-workspace-root-hints": Object.fromEntries(threads.map((t) => [t.id, t.cwd])),
      "electron-persisted-atom-state": {
        "chatgpt-migration-announcement-completed-v1": true,
        "electron:onboarding-projectless-completed": true,
        "electron:onboarding-hide-first-new-thread-promos": true,
        "thread-descriptions-v1": Object.fromEntries(threads.map((t) => [t.id, t.description])),
      },
    }),
    { mode: 0o600 },
  );
}

/**
 * Publishing a rollout rewrites its `history_mode` to `paginated`, so a thread
 * captured from a Codex home where it had already been published looks done and
 * gets skipped — leaving an empty thread in the list. Mark every seed legacy.
 */
function asLegacyRollout(rollout, rolloutPath) {
  const lines = rollout.split("\n");
  const sessionMeta = JSON.parse(lines[0]);
  if (sessionMeta.type !== "session_meta") {
    throw new Error(`${rolloutPath} does not start with a session_meta line.`);
  }
  sessionMeta.payload.history_mode = "legacy";
  lines[0] = JSON.stringify(sessionMeta);
  return lines.join("\n");
}

async function seedThreads(isolatedCodexHome, isolatedEnvironment, threadCwd) {
  const fixtures = await listSeedThreadFixtures();
  if (fixtures.length === 0) return [];

  const now = new Date();
  const iso = now.toISOString();
  const datePath = iso.slice(0, 10).replaceAll("-", "/");
  const stamp = `${iso.slice(0, 10)}T${iso.slice(11, 19).replaceAll(":", "-")}`;
  const sessionDir = path.join(isolatedCodexHome, "sessions", datePath);
  await mkdir(sessionDir, { recursive: true });

  const threads = [];
  for (const { meta, rolloutPath } of fixtures) {
    const rollout = (await readFile(rolloutPath, "utf8"))
      .replaceAll(meta.codexHomePlaceholder, isolatedCodexHome)
      .replaceAll(meta.homePlaceholder ?? "\u0000", homedir())
      .replaceAll(meta.cwdPlaceholder, threadCwd);

    await writeFile(
      path.join(sessionDir, `rollout-${stamp}-${meta.threadId}.jsonl`),
      asLegacyRollout(rollout, rolloutPath),
    );
    threads.push({
      id: meta.threadId,
      name: meta.threadName,
      cwd: threadCwd,
      description: meta.description || meta.threadName || meta.userMessage,
    });
    console.log(`Seeding thread "${meta.threadName}" (${meta.threadId})...`);
  }

  await writeFile(
    path.join(isolatedCodexHome, "session_index.jsonl"),
    `${threads
      .map((thread) => JSON.stringify({ id: thread.id, thread_name: thread.name, updated_at: iso }))
      .join("\n")}\n`,
  );
  await writeGlobalState(isolatedCodexHome, threads);

  // One pass publishes every seeded rollout into the paginated thread history
  // the desktop app reads.
  const report = JSON.parse(
    execFileSync(codexCli, ["migrate-rollouts", "--apply", "--json"], {
      cwd: repositoryRoot,
      env: isolatedEnvironment,
      encoding: "utf8",
    }),
  );
  const published = new Set(
    (report.outcomes ?? []).filter((o) => o.status === "migrated").map((o) => o.thread_id),
  );
  for (const thread of threads) {
    if (published.has(thread.id)) continue;
    console.warn(`Seed thread "${thread.name}" was not published and will open empty.`);
  }

  return threads;
}

async function preflight() {
  const requirements = [
    [chatGptExecutable, "The Codex desktop app is not installed at /Applications/ChatGPT.app."],
    [codexCli, "The Codex CLI is missing from the ChatGPT app bundle. Update the app."],
    [sourceAuth, `No Codex credentials at ${sourceAuth}. Sign in to Codex first.`],
  ];

  for (const [target, message] of requirements) {
    try {
      await access(target);
    } catch {
      throw new Error(
        `${message}\nThis loop drives the Codex desktop app on macOS. Use \`pnpm dev:server\` for server-only work.`,
      );
    }
  }
}

await preflight();
await stopLeftoverDevServer();

// Build once up front so the resource is never read before a bundle exists;
// the watcher started later keeps it fresh.
console.log("Building the widget bundle...");
await run("npx", ["vite", "build"]);

// Keep this path short. Codex binds `$CODEX_HOME/ipc/ipc.sock`, and macOS caps
// unix-socket paths around 104 bytes. `os.tmpdir()` on macOS is
// `/var/folders/...`, which overflows and makes the isolated instance silently
// miss CLI-installed plugins.
const isolatedRoot = await realpath(await mkdtemp("/tmp/mcpapp-"));
const isolatedCodexHome = path.join(isolatedRoot, "codex-home");
const isolatedUserData = path.join(isolatedRoot, "electron");
let appLaunchStarted = false;
let devServer;

try {
  await Promise.all([mkdir(isolatedCodexHome), mkdir(isolatedUserData)]);
  await copyFile(sourceAuth, path.join(isolatedCodexHome, "auth.json"));
  await chmod(path.join(isolatedCodexHome, "auth.json"), 0o600);
  await writeGlobalState(isolatedCodexHome);

  const isolatedEnvironment = { ...process.env, CODEX_HOME: isolatedCodexHome };

  console.log("Verifying the isolated Codex login...");
  await run(codexCli, ["login", "status"], { env: isolatedEnvironment });

  const marketplaceRoot = await stageMarketplace(isolatedRoot);
  console.log(`Installing ${pluginName} as the isolated instance's only local plugin...`);
  await run(codexCli, ["plugin", "marketplace", "add", marketplaceRoot, "--json"], { env: isolatedEnvironment });
  await run(codexCli, ["plugin", "add", `${pluginName}@${marketplaceName}`, "--json"], { env: isolatedEnvironment });

  const cacheRoot = path.join(isolatedCodexHome, "plugins", "cache", marketplaceName, pluginName);
  const cachedVersions = (await readdir(cacheRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  if (cachedVersions.length !== 1) {
    throw new Error(`Expected one cached plugin version, found ${cachedVersions.length}.`);
  }
  const cachedPlugin = path.join(cacheRoot, cachedVersions[0].name);
  console.log(`Plugin cache: ${cachedPlugin}`);
  await run(codexCli, ["plugin", "list", "--json"], { env: isolatedEnvironment });

  // A scratch workspace inside the isolated root: seeded threads get a real
  // directory to point at, and it disappears with the rest of the instance.
  const seedThreadCwd = path.join(isolatedRoot, "workspace");
  await mkdir(seedThreadCwd);
  const seededThreads = await seedThreads(isolatedCodexHome, isolatedEnvironment, seedThreadCwd);

  if (installOnly) {
    console.log("");
    console.log("Cached plugin contents:");
    for (const entry of await readdir(cachedPlugin)) console.log(`  ${entry}`);
    console.log(`.mcp.json: ${(await readFile(path.join(cachedPlugin, ".mcp.json"), "utf8")).trim()}`);
    console.log(`Seeded threads: ${seededThreads.map((thread) => thread.name).join(", ") || "none"}`);
    await rm(isolatedRoot, { recursive: true, force: true });
    console.log("\nInstall verified. Removed the isolated Codex environment.");
    process.exit(0);
  }

  console.log(`Starting the widget watcher and dev server at ${localOrigin}...`);
  devServer = startDevServer(port);
  await waitForEndpoint(`${localOrigin}/mcp`, devServer);

  console.log("");
  console.log(`Isolated Codex home: ${isolatedCodexHome}`);
  console.log(`MCP endpoint:        ${mcpEndpoint}`);
  console.log("");
  if (seededThreads.length > 0) {
    console.log("Seeded threads, ready to continue:");
    for (const thread of seededThreads) console.log(`  ${thread.name} — ${thread.description}`);
  }
  console.log("Ask the agent for a napkin to sketch on.");
  console.log("Close the Codex window to tear down this isolated instance.");
  console.log("");

  appLaunchStarted = true;
  await run(chatGptExecutable, [`--user-data-dir=${isolatedUserData}`], {
    env: {
      ...process.env,
      CODEX_HOME: isolatedCodexHome,
      CODEX_ELECTRON_USER_DATA_PATH: isolatedUserData,
    },
  });

  await stopDevServer(devServer);
  await rm(isolatedRoot, { recursive: true, force: true });
  console.log("Removed the isolated Codex environment.");
} catch (error) {
  await stopDevServer(devServer);
  if (appLaunchStarted) {
    console.error(`Preserved isolated state at ${isolatedRoot}`);
  } else {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
  throw error;
}
