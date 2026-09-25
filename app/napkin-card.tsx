"use client";

import { useEffect, useRef, useState } from "react";

// Codex's measured inline ceiling (DECISIONS 003), so the napkin here is sized
// by the same rule it meets in a real host.
const CEILING = 620;

export type Sketch = { text: string; src: string };

/**
 * The page is the napkin's host. It speaks the part of the MCP Apps bridge the
 * widget uses — initialize, the tool input carrying the brief, size requests,
 * and the `ui/message` that returns the sketch — so the frame holds the
 * unmodified widget rather than a picture of it.
 */
export function NapkinCard({
  id,
  brief,
  title,
  inactive,
  onSketch,
}: {
  id: string;
  brief: string;
  title: string;
  inactive?: boolean;
  onSketch: (id: string, sketch: Sketch) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    function post(message: unknown) {
      frame.current?.contentWindow?.postMessage(message, window.location.origin);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (message?.jsonrpc !== "2.0") return;

      switch (message.method) {
        case "ui/initialize":
          post({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2026-01-26",
              hostInfo: { name: "napkin-site", version: "0.3.1" },
              hostCapabilities: { message: { text: {}, image: {} } },
              hostContext: {
                displayMode: "inline",
                availableDisplayModes: ["inline"],
                containerDimensions: { maxHeight: CEILING },
                platform: "desktop",
                theme: window.matchMedia("(prefers-color-scheme: dark)").matches
                  ? "dark"
                  : "light",
              },
            },
          });
          break;

        case "ui/notifications/initialized":
          post({
            jsonrpc: "2.0",
            method: "ui/notifications/tool-input",
            params: { arguments: { brief } },
          });
          break;

        case "ui/notifications/size-changed":
          setHeight(Math.min(message.params?.height ?? CEILING, CEILING));
          break;

        case "ui/message": {
          const content: { type: string; text?: string; data?: string; mimeType?: string }[] =
            message.params?.content ?? [];
          const text = content.find((block) => block.type === "text")?.text ?? "";
          const image = content.find((block) => block.type === "image");
          if (image) onSketch(id, { text, src: `data:${image.mimeType};base64,${image.data}` });
          post({ jsonrpc: "2.0", id: message.id, result: {} });
          break;
        }

        default:
          if (message.id !== undefined) post({ jsonrpc: "2.0", id: message.id, result: {} });
      }
    }

    window.addEventListener("message", onMessage);
    // The widget opens with `ui/initialize` and does not repeat it, so the
    // frame is only pointed at it once something is listening. A server-
    // rendered src would load it before hydration and lose the handshake, and
    // pointing it again would reload the napkin and wipe the drawing.
    if (frame.current && !frame.current.src) frame.current.src = "/demo";
    return () => window.removeEventListener("message", onMessage);
  }, [id, brief, onSketch]);

  return (
    <div className="card" data-inactive={inactive || undefined}>
      <iframe
        ref={frame}
        title={title}
        style={height ? { height } : undefined}
      />
    </div>
  );
}
