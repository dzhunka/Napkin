/**
 * Points the plugin at a deployment.
 *
 *   node scripts/set-endpoint.mjs https://your-project.vercel.app
 *
 * Writes the `/mcp` endpoint into `plugins/napkin/.mcp.json`, which Codex and
 * Claude Code read, and into the Cursor manifest, which carries its own copy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins", "napkin");
const input = process.argv[2];

if (!input) {
  console.error("Usage: node scripts/set-endpoint.mjs <deployment-url>");
  process.exit(1);
}

let endpoint;
try {
  const url = new URL(input.includes("://") ? input : `https://${input}`);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("remote endpoints must use https");
  }
  // Accept either the origin or a URL that already includes /mcp.
  url.pathname = url.pathname.replace(/\/+$/, "").endsWith("/mcp")
    ? url.pathname.replace(/\/+$/, "")
    : `${url.pathname.replace(/\/+$/, "")}/mcp`;
  url.search = "";
  url.hash = "";
  endpoint = url.toString();
} catch (err) {
  console.error(`Invalid URL: ${err.message}`);
  process.exit(1);
}

for (const file of [".mcp.json", path.join(".cursor-plugin", "plugin.json")]) {
  const filePath = path.join(plugin, file);
  const config = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const names = Object.keys(config.mcpServers ?? {});

  if (names.length !== 1) {
    console.error(
      `${file}: expected exactly one server, found ${names.length}. Edit it by hand.`,
    );
    process.exit(1);
  }

  config.mcpServers[names[0]].url = endpoint;
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`${file}: ${names[0]} -> ${endpoint}`);
}
