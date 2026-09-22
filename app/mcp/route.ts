import { readFile } from "node:fs/promises";
import path from "node:path";
import { createMcpHandler } from "mcp-handler";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

export const runtime = "nodejs";

// Hosts cache UI resources by URI. Bump this whenever you ship a widget change.
const UI_VERSION = "1";
const RESOURCE_URI = `ui://app/index.html?v=${UI_VERSION}`;

// ---------------------------------------------------------------------------
// Demo domain logic — replace this with your plugin's actual behaviour.
// ---------------------------------------------------------------------------
const TONES = ["plain", "formal", "enthusiastic"] as const;
type Tone = (typeof TONES)[number];

function greetingFor(name: string, tone: Tone): string {
  switch (tone) {
    case "formal":
      return `Good day, ${name}.`;
    case "enthusiastic":
      return `HEY ${name.toUpperCase()}!`;
    default:
      return `Hello, ${name}!`;
  }
}

// ---------------------------------------------------------------------------
// The widget is a Vite bundle inlined into one HTML file (see vite.config.ts).
// Serving a self-contained document means the host's iframe fetches nothing,
// so no sandbox CSP has to be negotiated. See DECISIONS.md.
//
// Read per request rather than cached at module scope, so `vite build --watch`
// output is picked up without restarting the server.
// ---------------------------------------------------------------------------
const WIDGET_BUNDLE = path.join(process.cwd(), "widget", "dist", "index.html");

async function readWidgetHtml(): Promise<string> {
  try {
    return await readFile(WIDGET_BUNDLE, "utf8");
  } catch {
    throw new Error(
      `Widget bundle not found at ${WIDGET_BUNDLE}. Run \`pnpm build:widget\`.`,
    );
  }
}

const handler = createMcpHandler(
  (server) => {
    registerAppResource(server, "app-widget", RESOURCE_URI, {}, async () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readWidgetHtml(),
        },
      ],
    }));

    // Model-facing entry point. The host renders the widget next to the result.
    registerAppTool(
      server,
      "greet",
      {
        title: "Greet",
        description: "Greet someone and open the greeting widget.",
        inputSchema: z.object({
          name: z.string().describe("Name of the person to greet"),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async ({ name }) => {
        const greeting = greetingFor(name, "plain");
        return {
          content: [{ type: "text", text: greeting }],
          structuredContent: { name, tone: "plain", greeting },
        };
      },
    );

    // `visibility: ["app"]` keeps this out of the model's tool list — it exists
    // only so the widget can call back into the server from a user interaction.
    registerAppTool(
      server,
      "set_tone",
      {
        title: "Set tone",
        description: "Re-render the greeting in a different tone.",
        inputSchema: z.object({ name: z.string(), tone: z.enum(TONES) }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: RESOURCE_URI, visibility: ["app"] } },
      },
      async ({ name, tone }) => {
        const greeting = greetingFor(name, tone);
        return {
          content: [{ type: "text", text: greeting }],
          structuredContent: { name, tone, greeting },
        };
      },
    );
  },
  {
    serverInfo: { name: "mcp-app-boilerplate", version: "0.1.0" },
    // Advertise the MCP Apps extension so UI-capable hosts negotiate it.
    capabilities: { extensions: { [EXTENSION_ID]: {} } },
  },
);

export const GET = handler;
export const POST = handler;
