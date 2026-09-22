import { useEffect, useRef, useState } from "react";
import { imageRoute, sendImage, useMcpApp } from "./use-mcp-app";

// The backing store is a fixed square while CSS decides the rendered size. The
// host controls the widget's width, and resizing a canvas clears it, so pinning
// the pixel buffer keeps a drawing from being wiped by a layout change and makes
// every napkin submit at the same resolution.
const NAPKIN_SIZE = 1024;
const PAPER = "#fafaf9";
const INK = "#1c1917";
// Deliberately bolder than a pen would be at this resolution: models downscale
// images before reading them, and a hairline stroke does not survive that.
const NIB = 8;

type Status = "drawing" | "sending" | "sent";

export function Widget() {
  const { connected, toolInput, hostCapabilities } = useMcpApp();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [hasInk, setHasInk] = useState(false);
  const [status, setStatus] = useState<Status>("drawing");
  const [error, setError] = useState<string | null>(null);

  const brief = typeof toolInput?.brief === "string" ? toolInput.brief : null;
  const route = imageRoute(hostCapabilities);
  const canSubmit = hasInk && status === "drawing" && connected && route !== null;

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    // Paint the paper instead of leaving the canvas transparent — a transparent
    // PNG composited onto a dark background hides the ink completely.
    context.fillStyle = PAPER;
    context.fillRect(0, 0, NAPKIN_SIZE, NAPKIN_SIZE);

    context.strokeStyle = INK;
    context.fillStyle = INK;
    context.lineWidth = NIB;
    context.lineCap = "round";
    context.lineJoin = "round";
    inkRef.current = context;
  }, []);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * NAPKIN_SIZE,
      y: ((event.clientY - bounds.top) / bounds.height) * NAPKIN_SIZE,
    };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = inkRef.current;
    if (!context || status !== "drawing") return;

    // Capture so a stroke that leaves the napkin keeps drawing until release.
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFrom(event);
    lastPointRef.current = point;

    // A tap without movement should still leave a mark.
    context.beginPath();
    context.arc(point.x, point.y, NIB / 2, 0, Math.PI * 2);
    context.fill();
    setHasInk(true);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const context = inkRef.current;
    const from = lastPointRef.current;
    if (!context || !from) return;

    const to = pointFrom(event);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    lastPointRef.current = to;
  }

  function onPointerUp() {
    lastPointRef.current = null;
  }

  async function onSubmit() {
    const canvas = canvasRef.current;
    if (!canvas || !canSubmit) return;

    setStatus("sending");
    setError(null);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await sendImage(
        dataUrl.slice(dataUrl.indexOf(",") + 1),
        brief
          ? `Here is my napkin sketch for: ${brief}`
          : "Here is my napkin sketch.",
      );
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("drawing");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 font-sans dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-sm font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
            Napkin
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {brief ?? "Sketch something rough, then send it."}
          </p>
        </header>

        <canvas
          ref={canvasRef}
          width={NAPKIN_SIZE}
          height={NAPKIN_SIZE}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          // `touch-none` keeps a finger or pencil stroke from scrolling the host
          // instead of drawing.
          className="aspect-square w-full touch-none rounded-sm bg-[#fafaf9] shadow-sm ring-1 ring-zinc-900/10 dark:ring-white/10"
          style={{ cursor: status === "drawing" ? "crosshair" : "default" }}
        />

        <footer className="flex items-center justify-between gap-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {status === "sent"
              ? "Sent to the conversation."
              : !connected
                ? "Open this through an MCP host to send a sketch."
                : route === null
                  ? "This host does not accept images from apps."
                  : hasInk
                    ? "Ready to send."
                    : "Draw on the napkin to begin."}
          </p>

          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Send"}
          </button>
        </footer>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </main>
    </div>
  );
}
