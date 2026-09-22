/**
 * Smoke-tests the MCP endpoint the way a real host would: connects over
 * Streamable HTTP as a UI-capable client, lists tools, calls the model-facing
 * tool, and reads the widget resource it points at.
 *
 *   node scripts/test-client.mjs [base-url]
 */
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const url = new URL(`${base}/mcp`);

const client = new Client(
  { name: "boilerplate-smoke-test", version: "0.1.0" },
  { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } },
);

await client.connect(new StreamableHTTPClientTransport(url));

const pass = [];
const fail = [];
const check = (label, ok, detail) =>
  (ok ? pass : fail).push(detail ? `${label} — ${detail}` : label);

console.log(`Connected to ${url}`);
console.log("Protocol:", client.getServerVersion?.() ?? "(unknown)");
console.log("Server capabilities:", JSON.stringify(client.getServerCapabilities()));

// 1. The server must advertise the MCP Apps extension.
const caps = client.getServerCapabilities() ?? {};
check(
  "server advertises MCP Apps extension",
  Boolean(caps.extensions?.[EXTENSION_ID]),
  `extensions=${JSON.stringify(caps.extensions)}`,
);

// 2. Tools list: `greet` is model-visible, `set_tone` is app-only.
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log("\nTools:", names.join(", "));
const greet = tools.find((t) => t.name === "greet");
check("greet tool is listed", Boolean(greet));
check(
  "greet points at a ui:// resource",
  greet?._meta?.ui?.resourceUri?.startsWith("ui://"),
  `resourceUri=${greet?._meta?.ui?.resourceUri}`,
);

// 3. Calling the tool returns text plus structured widget state.
const result = await client.callTool({ name: "greet", arguments: { name: "Ada" } });
console.log("\ngreet result:", JSON.stringify(result.structuredContent));
check(
  "greet returns text content",
  result.content?.some((c) => c.type === "text" && c.text.includes("Ada")),
);
check("greet returns structuredContent", Boolean(result.structuredContent?.greeting));

// 4. The referenced UI resource must be readable and be real HTML.
const resourceUri = greet?._meta?.ui?.resourceUri;
const read = await client.readResource({ uri: resourceUri });
const html = read.contents?.[0]?.text ?? "";
check(
  "UI resource uses the MCP Apps MIME type",
  read.contents?.[0]?.mimeType === RESOURCE_MIME_TYPE,
  `mimeType=${read.contents?.[0]?.mimeType}`,
);
check("UI resource is an HTML document", /<html/i.test(html), `${html.length} bytes`);

// The bundle must be self-contained: host sandboxes restrict which origins a
// widget may load subresources from, so anything external is a latent failure.
const external = [...html.matchAll(/<(?:script|link|img)[^>]*(?:src|href)="([^"]+)"/gi)]
  .map((m) => m[1])
  .filter((ref) => !ref.startsWith("data:") && !ref.startsWith("#"));
check(
  "UI resource is self-contained",
  external.length === 0,
  external.length ? `external refs: ${external.slice(0, 3).join(", ")}` : undefined,
);

// 5. The app-only tool works when called directly (as the widget does).
const toned = await client.callTool({
  name: "set_tone",
  arguments: { name: "Ada", tone: "enthusiastic" },
});
check(
  "set_tone changes the greeting",
  toned.structuredContent?.greeting === "HEY ADA!",
  `greeting=${toned.structuredContent?.greeting}`,
);

console.log("");
for (const p of pass) console.log(`  PASS  ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);

await client.close();
process.exit(fail.length ? 1 : 0);
