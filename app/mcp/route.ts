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
const UI_VERSION = "4";
const RESOURCE_URI = `ui://napkin/index.html?v=${UI_VERSION}`;

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

    // The only tool. Opening the napkin is all the server does — the sketch
    // itself never comes back through here. The widget hands the PNG straight to
    // the host as a user message, so there is no upload endpoint and no state to
    // keep between the tool call and the drawing.
    registerAppTool(
      server,
      "open_napkin",
      {
        title: "Open a napkin",
        description:
          "Open a blank napkin for the user to sketch on. Their drawing arrives " +
          "as an image in their next message. Use when a rough sketch would " +
          "convey more than a description — layout, shape, arrangement, or a " +
          "visual direction the user is struggling to put into words.",
        inputSchema: z.object({
          brief: z
            .string()
            .optional()
            .describe(
              "What the sketch is for, shown on the napkin as a reminder. " +
                "For example: 'rough logo direction'.",
            ),
        }),
        annotations: { readOnlyHint: true, openWorldHint: false },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async ({ brief }) => ({
        content: [
          {
            type: "text",
            text:
              "A blank napkin is open. Stop here and wait — the sketch will " +
              "arrive as an image in the user's next message. Do not guess what " +
              "they are drawing.",
          },
        ],
        structuredContent: { brief: brief ?? null },
      }),
    );
  },
  {
    serverInfo: { name: "napkin", version: "0.2.0" },
    // Advertise the MCP Apps extension so UI-capable hosts negotiate it.
    capabilities: { extensions: { [EXTENSION_ID]: {} } },
  },
);

export const GET = handler;
export const POST = handler;
