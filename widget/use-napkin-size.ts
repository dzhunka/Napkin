import { useEffect, useState } from "react";
import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";

// ---------------------------------------------------------------------------
// How big the napkin is, and which way round it lies.
//
// The host does not give the widget a viewport to fill. It gives it a frame
// with a ceiling, sizes the iframe to whatever the content asks for, and
// scrolls whatever does not fit. So a napkin whose height follows from its
// width — a square in a wide card — asks for more height than the frame has
// and is handed a scrollbar.
//
// Knowing the ceiling would settle it, and hosts appear to say: Codex reports
// 568 x 620 inline, Cursor the transcript width x 800. But Codex's figure is
// measured, not declared:
//
//   // ChatGPT.app/Contents/Resources/app.asar, minified
//   function p4o(e, t, n) { return { maxHeight: e.clientHeight, maxWidth: e.clientWidth }; }
//
// and the container it measures is the one the widget was just granted — which
// is the size the widget asked for. Sizing against that number is a loop:
// every pass spends the Send button's height again and the napkin walks itself
// down to nothing.
//
// So the ceiling is not read. It is discovered: ask for the size the paper
// wants, and if the host clamps us — which we can see, because our own
// document is then taller than its viewport — the height we were granted is
// the ceiling, and it is the truth rather than a report about it.
// ---------------------------------------------------------------------------

// A napkin is a rectangle, and this is the proportion that reads as chosen
// rather than arbitrary. Landscape where there is room to be wide, portrait on
// a device held upright, but the same ratio either way.
const PHI = 1.618;

// The backing store is fixed per orientation so that resizing the frame never
// clears a drawing, and every napkin submits at the same resolution.
const LONG_EDGE = 1024;
const SHORT_EDGE = Math.round(LONG_EDGE / PHI);

// The Send button is a slab of known height rather than something measured:
// the paper takes the height that is left after it, and measuring would make
// that a second layout pass the host would see as a resize.
export const SEND_HEIGHT = 44;

// Below this there is nothing to draw on. If a host really is this short,
// overflowing it is the lesser of the two failures.
const MIN_PAPER = 160;

// Only used before there is a document to measure.
const ASSUMED_WIDTH = 560;

// Long enough for a host to have resized the iframe it was just told about,
// short enough that a napkin which asked for too much is not left hanging out
// of its card while we make up our mind.
const SETTLING_MS = 200;

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

/** How much height there is, and whether that is evidence or just optimism. */
type Room = { ceiling: number; known: boolean };

const UNBOUNDED: Room = { ceiling: Number.POSITIVE_INFINITY, known: false };

/** `containerDimensions` is a union of fixed and bounded forms; both may be absent. */
type Frame = { height?: number; maxHeight?: number; width?: number; maxWidth?: number };

/**
 * What the host says about the height of the box it is drawing us in.
 *
 * Anything too short to draw on is treated as no answer at all — a container
 * measured before it was laid out, rather than a host with nothing to offer.
 */
function reportedHeight(host: McpUiHostContext | undefined): number | undefined {
  const frame = host?.containerDimensions as Frame | undefined;
  const reported = frame?.height ?? frame?.maxHeight;
  return reported !== undefined && reported >= MIN_PAPER + SEND_HEIGHT
    ? reported
    : undefined;
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
  const [room, setRoom] = useState<Room>(UNBOUNDED);

  // Both halves of the frame come from watching the document rather than from
  // being told: the content box for our own layout, the window for the host
  // resizing us.
  //
  // Being scrolled is the only honest measurement of the ceiling available
  // from in here, but it has to be read patiently. Every time the napkin grows
  // it overflows for a moment, because the host cannot resize the iframe until
  // after it has been told — so an overflow only means a refusal once the host
  // has had time to answer and the document is still taller than its frame.
  useEffect(() => {
    let settling: ReturnType<typeof setTimeout> | undefined;

    function overflow() {
      const root = document.documentElement;
      return root.scrollHeight > root.clientHeight;
    }

    function measure() {
      setWidth(frameWidth());

      clearTimeout(settling);
      if (!overflow()) return;
      settling = setTimeout(() => {
        if (!overflow()) return;
        const granted = window.innerHeight;
        setRoom((current) =>
          current.ceiling === granted ? current : { ceiling: granted, known: true },
        );
      }, SETTLING_MS);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(settling);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // The host's own figure is worth having twice: as an opening estimate, since
  // the first one is measured before we have asked for anything, and later
  // only when it exceeds what we believe we have. It can never shrink the
  // napkin, because a report of our own height is not news about the room.
  const reported = reportedHeight(host);
  if (reported !== undefined && (!room.known || reported > room.ceiling)) {
    setRoom({ ceiling: reported, known: true });
  }

  const insets = host?.safeAreaInsets ?? NO_INSETS;
  const space = {
    width: width - insets.left - insets.right,
    height: room.ceiling - insets.top - insets.bottom - SEND_HEIGHT,
  };

  // A handheld gets a portrait napkin, except when it is turned on its side and
  // the space it offers is wider than it is tall. Everything else is landscape.
  const current: Orientation =
    isHandheld(host) && space.height >= space.width ? "portrait" : "landscape";

  const [orientation, setOrientation] = useState(current);
  if (!lockOrientation && orientation !== current) setOrientation(current);

  const ratio = orientation === "landscape" ? PHI : 1 / PHI;
  const paperWidth = Math.max(
    MIN_PAPER,
    Math.floor(Math.min(space.width, space.height * ratio)),
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
