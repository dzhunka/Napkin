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
  { name: "napkin-smoke-test", version: "0.1.0" },
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

// 2. Tools list: `open_napkin` is the whole model-facing surface.
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.log("\nTools:", names.join(", "));
const open = tools.find((t) => t.name === "open_napkin");
check("open_napkin tool is listed", Boolean(open));
check("open_napkin is the only tool", names.length === 1, `tools=${names.join(", ")}`);
check(
  "open_napkin points at a ui:// resource",
  open?._meta?.ui?.resourceUri?.startsWith("ui://"),
  `resourceUri=${open?._meta?.ui?.resourceUri}`,
);

// 3. Opening a napkin returns the brief as widget state, and tells the model to
// wait rather than narrate a drawing that does not exist yet.
const brief = "rough logo direction";
const result = await client.callTool({
  name: "open_napkin",
  arguments: { brief },
});
console.log("\nopen_napkin result:", JSON.stringify(result.structuredContent));
check(
  "open_napkin tells the model to wait",
  result.content?.some((c) => c.type === "text" && /wait/i.test(c.text)),
);
check(
  "open_napkin passes the brief to the widget",
  result.structuredContent?.brief === brief,
  `brief=${result.structuredContent?.brief}`,
);

// 4. The referenced UI resource must be readable and be real HTML.
const resourceUri = open?._meta?.ui?.resourceUri;
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

// 5. The napkin is only useful if the bundle carries something to draw on and a
// way to export it, which a stale or half-built bundle would silently drop.
// Matched as a quoted token, since Tailwind's reset also names `canvas`.
check("UI resource renders a canvas", /(["'`])canvas\1/.test(html));
check("UI resource exports the drawing as a PNG", /toDataURL/.test(html));

console.log("");
for (const p of pass) console.log(`  PASS  ${p}`);
for (const f of fail) console.log(`  FAIL  ${f}`);
console.log(`\n${pass.length} passed, ${fail.length} failed`);

await client.close();
process.exit(fail.length ? 1 : 0);
