import { useSyncExternalStore } from "react";
import type {
  App,
  McpUiHostCapabilities,
  McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

// ---------------------------------------------------------------------------
// Session-persistent singleton App instance.
//
// The host establishes one bridge per iframe, so the `App` is created once at
// module scope rather than per component. `@modelcontextprotocol/ext-apps/react`
// offers a `useApp` hook, but it reconnects per mounting component; a singleton
// keeps the bridge alive no matter how the widget re-renders or which view is
// mounted. Tool data is mirrored into sessionStorage so it also survives module
// re-evaluation during HMR.
// ---------------------------------------------------------------------------

const STORAGE = {
  INPUT: "__mcp_tool_input",
  RESULT: "__mcp_tool_result",
  CONNECTED: "__mcp_connected",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* sessionStorage may be unavailable in some sandboxes */
  }
}

// In-memory cache (fast path, avoids JSON.parse on every render)
let memConnected = read<boolean>(STORAGE.CONNECTED) ?? false;
let memToolInput = read<Record<string, unknown>>(STORAGE.INPUT);
let memToolResult = read<Record<string, unknown>>(STORAGE.RESULT);

// Not mirrored into sessionStorage: capabilities describe the live bridge, and a
// stale copy would have us offer a path the current host never agreed to. The
// same goes for context, which describes a frame that may since have resized.
let memHostCapabilities: McpUiHostCapabilities | undefined;
let memHostContext: McpUiHostContext | undefined;

const listeners = new Set<() => void>();
function notify() {
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setToolResult(result: Record<string, unknown> | null) {
  memToolResult = result;
  write(STORAGE.RESULT, result);
  notify();
}

// ---------------------------------------------------------------------------
// Singleton connection
// ---------------------------------------------------------------------------

let singletonApp: App | null = null;

async function ensureConnected() {
  if (singletonApp) return;

  const { App } = await import("@modelcontextprotocol/ext-apps");

  const app = new App(
    { name: "napkin-widget", version: "0.2.0" },
    {},
    { autoResize: true },
  );

  app.ontoolinput = (params) => {
    memToolInput = params.arguments ?? null;
    write(STORAGE.INPUT, memToolInput);
    notify();
  };

  app.ontoolresult = (result) => {
    setToolResult((result.structuredContent as Record<string, unknown>) ?? null);
  };

  // The notification carries only what changed; the app merges it into its own
  // context before calling back, so read the merged whole rather than the part.
  app.onhostcontextchanged = () => {
    memHostContext = app.getHostContext();
    notify();
  };

  app.onerror = (error) => {
    console.error("[mcp-app] error:", error);
  };

  try {
    await app.connect();
    singletonApp = app;
    memConnected = true;
    memHostCapabilities = app.getHostCapabilities();
    memHostContext = app.getHostContext();
    write(STORAGE.CONNECTED, true);
    notify();
  } catch (err) {
    console.warn("[mcp-app] connect failed (not running in an MCP host?):", err);
  }
}

// Kick off the connection once, and only inside a host iframe.
if (typeof window !== "undefined" && window.self !== window.top) {
  ensureConnected();
}

/**
 * Call one of this server's tools from the widget and adopt its result as the
 * new widget state. The tool must be registered with `visibility: ["app"]` or
 * be otherwise callable by the app.
 */
async function callTool(name: string, args: Record<string, unknown>) {
  if (!singletonApp) throw new Error("MCP app bridge is not connected");
  const result = await singletonApp.callServerTool({ name, arguments: args });
  setToolResult((result.structuredContent as Record<string, unknown>) ?? null);
  return result;
}

/** Which route, if any, this host leaves open for handing it an image. */
export type ImageRoute = "message" | "model-context" | null;

export function imageRoute(
  capabilities: McpUiHostCapabilities | undefined,
): ImageRoute {
  if (capabilities?.message?.image) return "message";
  if (capabilities?.updateModelContext?.image) return "model-context";
  return null;
}

/**
 * Hand a PNG to the host as if the user had attached it themselves, and start a
 * turn so the model reads it now rather than whenever the user next types.
 *
 * Hosts declare accepted content blocks per method, so the route is negotiated
 * rather than assumed. `ui/message` is the direct one: Codex pulls the image
 * out of the content blocks and posts it into the composer as a user message.
 * A host that takes images only as model context needs the image parked there
 * first, with a text message as the trigger, since a context update on its own
 * deliberately does not start a turn.
 */
export async function sendImage(pngBase64: string, text: string): Promise<void> {
  if (!singletonApp) throw new Error("MCP app bridge is not connected");

  const image = { type: "image" as const, data: pngBase64, mimeType: "image/png" };
  const message = { type: "text" as const, text };

  switch (imageRoute(singletonApp.getHostCapabilities())) {
    case "message": {
      const result = await singletonApp.sendMessage({
        role: "user",
        content: [message, image],
      });
      if (result.isError) throw new Error("The host refused the message.");
      return;
    }
    case "model-context": {
      await singletonApp.updateModelContext({ content: [image] });
      const result = await singletonApp.sendMessage({
        role: "user",
        content: [message],
      });
      if (result.isError) throw new Error("The host refused the message.");
      return;
    }
    default:
      throw new Error("This host does not accept images from apps.");
  }
}

/**
 * React hook exposing the MCP Apps bridge: the tool arguments the model sent,
 * the latest structured result, what the host says it can do and how much room
 * it has given us, and a way to call back into the server.
 */
export function useMcpApp() {
  const connected = useSyncExternalStore(
    subscribe,
    () => memConnected,
    () => false,
  );
  const toolInput = useSyncExternalStore(
    subscribe,
    () => memToolInput,
    () => null,
  );
  const toolResult = useSyncExternalStore(
    subscribe,
    () => memToolResult,
    () => null,
  );
  const hostCapabilities = useSyncExternalStore(
    subscribe,
    () => memHostCapabilities,
    () => undefined,
  );
  const hostContext = useSyncExternalStore(
    subscribe,
    () => memHostContext,
    () => undefined,
  );

  return {
    app: singletonApp,
    connected,
    toolInput,
    toolResult,
    callTool,
    hostCapabilities,
    hostContext,
  };
}
