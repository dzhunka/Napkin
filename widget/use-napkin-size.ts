import { useEffect, useState } from "react";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";

// ---------------------------------------------------------------------------
// How big the napkin is, and which way round it lies.
//
// The host does not give the widget a viewport to fill. It gives it a frame
// with a maximum height, sizes the iframe to whatever the content asks for, and
// scrolls whatever does not fit. So a napkin whose height follows from its
// width — a square in a wide card — asks for more height than the frame has and
// is handed a scrollbar. The height has to be chosen against the frame instead.
//
// Hosts report the frame in `containerDimensions`. Measured: Codex desktop
// inline gives 568 x 620; Cursor gives the transcript width x 800.
// ---------------------------------------------------------------------------

// A napkin is a rectangle, and this is the proportion that reads as chosen
// rather than arbitrary. Landscape where there is room to be wide, portrait on
// a device held upright, but the same ratio either way.
const PHI = 1.618;

// The backing store is fixed per orientation so that resizing the frame never
// clears a drawing, and every napkin submits at the same resolution regardless
// of the host it was drawn in.
const LONG_EDGE = 1024;
const SHORT_EDGE = Math.round(LONG_EDGE / PHI);

// The Send button is a slab of known height rather than something measured:
// the paper takes the height that is left after it, and measuring would make
// that a second layout pass the host would see as a resize.
export const SEND_HEIGHT = 44;

// A host that reports no frame still gets a napkin. The guess sits under both
// hosts measured above, because guessing high is the failure being fixed.
const ASSUMED_HEIGHT = 560;
const ASSUMED_WIDTH = 560;

// Below this there is nothing to draw on. If a host really is this short,
// overflowing it is the lesser of the two failures.
const MIN_PAPER = 160;

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

export type Orientation = "landscape" | "portrait";

export type NapkinSize = {
  orientation: Orientation;
  /** CSS pixels the paper occupies in the host's frame. */
  width: number;
  height: number;
  /** Canvas backing store, fixed per orientation. */
  pixels: { width: number; height: number };
  /** Parts of the frame the host says are obscured. */
  insets: { top: number; right: number; bottom: number; left: number };
};

/** `containerDimensions` is a union of fixed and bounded forms; both may be absent. */
type Frame = { height?: number; maxHeight?: number; width?: number; maxWidth?: number };

function frameHeight(host: McpUiHostContext | undefined): number {
  const frame = host?.containerDimensions as Frame | undefined;
  return frame?.height ?? frame?.maxHeight ?? ASSUMED_HEIGHT;
}

/**
 * The frame's width needs no host context — the host sets the iframe's width
 * directly, so the document already knows it.
 *
 * `innerWidth` and not `documentElement.clientWidth`: the latter loses the
 * width of a scrollbar, so a napkin measured against it would be narrowed by
 * the overflow it caused, change the overflow, and be measured again. Auto-
 * resize reports the frame to the host as `innerWidth` for the same reason.
 */
function frameWidth(): number {
  if (typeof window === "undefined") return ASSUMED_WIDTH;
  return window.innerWidth || ASSUMED_WIDTH;
}

/**
 * Whether this is a device held in a hand rather than sat in front of.
 *
 * Hosts that say so are believed. The rest are read the way CSS reads them: a
 * coarse pointer that cannot hover is a finger.
 */
function isHandheld(host: McpUiHostContext | undefined): boolean {
  if (host?.platform === "mobile") return true;
  if (host?.platform === "desktop") return false;

  const device = host?.deviceCapabilities;
  if (device?.touch !== undefined || device?.hover !== undefined) {
    return device.touch === true && device.hover !== true;
  }

  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (hover: none)").matches;
}

/**
 * The napkin's size in the space the host has given it.
 *
 * @param host - Host context, or `undefined` before the bridge connects.
 * @param lockOrientation - Hold the current orientation. Turning the napkin
 *   resizes the backing store, which clears it, so once there is ink on the
 *   paper a rotation must not be allowed to take the drawing with it.
 */
export function useNapkinSize(
  host: McpUiHostContext | undefined,
  lockOrientation: boolean,
): NapkinSize {
  const [width, setWidth] = useState(frameWidth);

  // The document is the frame, so watching it catches the host resizing us —
  // a sidebar opening, a window dragged narrower — without waiting for the
  // host to get round to sending a new context.
  useEffect(() => {
    const observer = new ResizeObserver(() => setWidth(frameWidth()));
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  const insets = host?.safeAreaInsets ?? NO_INSETS;
  const room = {
    width: width - insets.left - insets.right,
    height: frameHeight(host) - insets.top - insets.bottom - SEND_HEIGHT,
  };

  // A handheld gets a portrait napkin, except when it is turned on its side and
  // the space it offers is wider than it is tall. Everything else is landscape.
  const current: Orientation =
    isHandheld(host) && room.height >= room.width ? "portrait" : "landscape";

  const [orientation, setOrientation] = useState(current);
  if (!lockOrientation && orientation !== current) setOrientation(current);

  const ratio = orientation === "landscape" ? PHI : 1 / PHI;
  const paperWidth = Math.max(
    MIN_PAPER,
    Math.floor(Math.min(room.width, room.height * ratio)),
  );

  return {
    orientation,
    width: paperWidth,
    // Floored, not rounded: a napkin that fits the frame to the pixel is the
    // point, and half a pixel of extra height is a scrollbar.
    height: Math.floor(paperWidth / ratio),
    pixels:
      orientation === "landscape"
        ? { width: LONG_EDGE, height: SHORT_EDGE }
        : { width: SHORT_EDGE, height: LONG_EDGE },
    insets,
  };
}
