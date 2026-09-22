import { useSyncExternalStore } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";

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
    { name: "napkin-widget", version: "0.1.0" },
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

  app.onerror = (error) => {
    console.error("[mcp-app] error:", error);
  };

  try {
    await app.connect();
    singletonApp = app;
    memConnected = true;
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

/**
 * React hook exposing the MCP Apps bridge: the tool arguments the model sent,
 * the latest structured result, and a way to call back into the server.
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

  return { app: singletonApp, connected, toolInput, toolResult, callTool };
}
