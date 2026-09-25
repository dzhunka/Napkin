/**
 * Launch a separate Cursor desktop instance with Napkin installed as a local
 * plugin pointed at the local dev server.
 *
 * Cursor loads local plugins from `~/.cursor/plugins/local` regardless of the
 * profile, so the plugin there points at localhost only for the session and
 * the production copy is restored when the isolated window closes. The
 * profile itself persists under `~/.napkin/cursor-dev`, so a one-time sign-in
 * carries over between runs. `HOME` is not overridden, because that breaks
 * Cursor's Keychain access.
 */
import { unwatchFile, watchFile } from "node:fs";
import { access, cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import {
  repositoryRoot,
  startDevServer,
  stopDevServer,
  stopLeftoverDevServer,
  waitForEndpoint,
} from "./dev-web.mjs";

const cursorExecutable = "/Applications/Cursor.app/Contents/MacOS/Cursor";
const pluginSource = path.join(repositoryRoot, "plugins", "napkin");
const sourceSkill = path.join(pluginSource, "skills", "napkin", "SKILL.md");
const port = 3100;
const mcpEndpoint = `http://127.0.0.1:${port}/mcp`;
const isolatedRoot = path.join(homedir(), ".napkin", "cursor-dev");
const isolatedUserData = path.join(isolatedRoot, "user-data");
const isolatedExtensions = path.join(isolatedRoot, "extensions");
const cachedPlugin = path.join(homedir(), ".cursor", "plugins", "local", "napkin");
const cachedSkill = path.join(cachedPlugin, "skills", "napkin", "SKILL.md");

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

async function restoreProductionPlugin() {
  await rm(cachedPlugin, { recursive: true, force: true });
  await mkdir(path.dirname(cachedPlugin), { recursive: true });
  await cp(pluginSource, cachedPlugin, { recursive: true });
}

async function pointPluginAtLocalhost() {
  const mcpServers = { napkin: { type: "http", url: mcpEndpoint } };
  await writeFile(
    path.join(cachedPlugin, ".mcp.json"),
    `${JSON.stringify({ mcpServers }, null, 2)}\n`,
  );

  const manifestPath = path.join(cachedPlugin, ".cursor-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.mcpServers = mcpServers;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

await access(cursorExecutable);
await stopLeftoverDevServer();

console.log("Building the widget bundle...");
await run("npx", ["vite", "build"]);

let devServer;
let skillUpdates = Promise.resolve();

try {
  await Promise.all([
    mkdir(isolatedUserData, { recursive: true }),
    mkdir(isolatedExtensions, { recursive: true }),
  ]);

  console.log("Installing Napkin into Cursor's local plugins with a localhost MCP URL...");
  await restoreProductionPlugin();
  await pointPluginAtLocalhost();

  watchFile(sourceSkill, { interval: 300 }, (current, previous) => {
    if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
    skillUpdates = skillUpdates
      .catch(() => {})
      .then(async () => {
        await cp(sourceSkill, cachedSkill);
        console.log("[napkin] SKILL.md updated. Start a new agent chat to load it.");
      })
      .catch((error) => console.error(`[napkin] Skill refresh failed: ${error.message}`));
  });

  console.log(`Starting the widget watcher and dev server at http://127.0.0.1:${port}...`);
  devServer = startDevServer(port);
  await waitForEndpoint(mcpEndpoint, devServer);

  const userData = await realpath(isolatedUserData);
  const extensions = await realpath(isolatedExtensions);
  console.log(`Isolated Cursor user data: ${userData}`);
  console.log("Sign in once if prompted; this profile persists under ~/.napkin/cursor-dev.");
  console.log("Close that instance to stop the local development server.");

  await run(cursorExecutable, [
    `--user-data-dir=${userData}`,
    `--extensions-dir=${extensions}`,
    repositoryRoot,
  ]);

  unwatchFile(sourceSkill);
  await stopDevServer(devServer);
  await skillUpdates;
  await restoreProductionPlugin();
  console.log("Stopped the dev server and restored the production local plugin.");
} catch (error) {
  unwatchFile(sourceSkill);
  await stopDevServer(devServer);
  await restoreProductionPlugin();
  throw error;
}
