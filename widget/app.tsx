import { useEffect, useRef, useState } from "react";
import { imageRoute, sendImage, useMcpApp } from "./use-mcp-app";
import { SEND_HEIGHT, useNapkinSize } from "./use-napkin-size";

const PAPER = "#fafaf9";
const INK = "#1c1917";
// Deliberately bolder than a pen would be at this resolution: models downscale
// images before reading them, and a hairline stroke does not survive that.
const NIB = 8;

type Status = "drawing" | "sending" | "sent";

export function Widget() {
  const { connected, toolInput, hostCapabilities, hostContext } = useMcpApp();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inkRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const [hasInk, setHasInk] = useState(false);
  const [status, setStatus] = useState<Status>("drawing");
  const [error, setError] = useState<string | null>(null);

  const napkin = useNapkinSize(hostContext, hasInk);
  const brief = typeof toolInput?.brief === "string" ? toolInput.brief : null;
  const route = imageRoute(hostCapabilities);
  const canSubmit = hasInk && status === "drawing" && connected && route !== null;

  // Runs again if the napkin turns, because setting the backing store's size
  // clears it and resets everything the context was holding.
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    // Paint the paper instead of leaving the canvas transparent — a transparent
    // PNG composited onto a dark background hides the ink completely.
    context.fillStyle = PAPER;
    context.fillRect(0, 0, napkin.pixels.width, napkin.pixels.height);

    context.strokeStyle = INK;
    context.fillStyle = INK;
    context.lineWidth = NIB;
    context.lineCap = "round";
    context.lineJoin = "round";
    inkRef.current = context;
  }, [napkin.pixels.width, napkin.pixels.height]);

  // Read the backing store off the element rather than from the layout, so the
  // pen lands where the cursor is however the host has scaled the paper.
  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
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

  // Only the conditions that stop a sketch being sent are worth saying out
  // loud; "ready to send" and "draw to begin" are things the napkin itself
  // already communicates.
  const notice =
    error ??
    (!connected
      ? "Open this through an MCP host to send a sketch."
      : route === null
        ? "This host does not accept images from apps."
        : null);

  // The host renders the app in a card it titles and sizes, so the widget adds
  // no frame of its own — no page background, no heading, no margins. The
  // napkin takes the width it is given until the frame's height is the tighter
  // of the two bounds, at which point it narrows and centres rather than
  // spilling past the bottom of the card.
  return (
    <div
      className="flex justify-center font-sans"
      style={{
        paddingTop: napkin.insets.top,
        paddingRight: napkin.insets.right,
        paddingBottom: napkin.insets.bottom,
        paddingLeft: napkin.insets.left,
      }}
    >
      <div style={{ width: napkin.width }}>
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={napkin.pixels.width}
            height={napkin.pixels.height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            // `touch-none` keeps a finger or pencil stroke from scrolling the
            // host instead of drawing.
            className="block touch-none bg-[#fafaf9]"
            style={{
              width: napkin.width,
              height: napkin.height,
              cursor: status === "drawing" ? "crosshair" : "default",
            }}
          />

          {/* The model's brief is written on the napkin instead of above it,
              and fades on the first stroke so it never competes with the
              drawing. It is DOM, not paint, so it never reaches the sent PNG. */}
          <p
            aria-hidden={hasInk}
            className={`pointer-events-none absolute inset-0 flex select-none items-center justify-center px-6 text-center text-sm text-zinc-400 transition-opacity duration-300 ${
              hasInk ? "opacity-0" : "opacity-100"
            }`}
          >
            {brief ?? "Sketch something rough, then send it."}
          </p>

          {notice && status !== "sent" && (
            <p
              className={`absolute bottom-3 left-3 max-w-[70%] rounded-full bg-white/90 px-2.5 py-1 text-xs ring-1 ring-zinc-900/10 ${
                error ? "text-red-600" : "text-zinc-500"
              }`}
            >
              {notice}
            </p>
          )}
        </div>

        {/* As wide as the paper and flush against it so the two read as one
            object. A floating button on the napkin would have landed a few
            pixels above the host's own send button, in the same corner, with
            the same arrow. This sits below the paper on the host's surface, so
            unlike anything drawn on the napkin it follows the host's theme. */}
        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{ height: SEND_HEIGHT }}
          className="block w-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {status === "sending" ? "Sending…" : status === "sent" ? "Sent" : "Send"}
        </button>
      </div>
    </div>
  );
}
