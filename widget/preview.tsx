/**
 * Dev-only preview: the widget inside a mock chat transcript.
 *
 * The widget is never seen on its own — a host renders it mid-conversation, in
 * a card the host sizes, against the host's own theme. Iterating on it as a
 * standalone page at full viewport width judges it in conditions it never
 * actually meets.
 *
 * The harness speaks enough of the MCP Apps wire protocol to be that host: it
 * answers `ui/initialize` with a frame and a platform, sizes the iframe from
 * `ui/notifications/size-changed` and clamps it the way a real host does, and
 * takes the sketch back through `ui/message`. Guessing at the widget's size
 * instead would hide the one thing the frames below exist to test.
 *
 * Nothing here ships. Vite builds only the `widget/index.html` entry, so this
 * file, `preview.html`, and `preview.css` stay out of `widget/dist`, and the
 * widget itself is loaded unmodified in an iframe rather than imported, so it
 * cannot pick up anything from the harness. Served at
 * http://localhost:5173/preview.html by `pnpm dev:preview`.
 */
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./preview.css";

type Theme = "system" | "light" | "dark";
type Resolved = "light" | "dark";

type Frame = {
  label: string;
  width: number;
  maxHeight: number;
  platform: "desktop" | "mobile";
};

/**
 * Hosts give an app a column with a ceiling, not a window. The first two are
 * measured from the shipped hosts (see DECISIONS 003); the last two bracket the
 * range around them.
 */
const FRAMES: Frame[] = [
  { label: "codex", width: 568, maxHeight: 620, platform: "desktop" },
  { label: "cursor", width: 720, maxHeight: 800, platform: "desktop" },
  { label: "sidebar", width: 380, maxHeight: 620, platform: "desktop" },
  { label: "phone", width: 390, maxHeight: 520, platform: "mobile" },
];

const THEMES: Theme[] = ["system", "light", "dark"];

const PROTOCOL_VERSION = "2026-01-26";

function hostContext(frame: Frame, theme: Resolved) {
  return {
    displayMode: "inline",
    availableDisplayModes: ["inline"],
    containerDimensions: { width: frame.width, maxHeight: frame.maxHeight },
    platform: frame.platform,
    deviceCapabilities:
      frame.platform === "mobile"
        ? { touch: true, hover: false }
        : { touch: false, hover: true },
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: "napkin-preview",
    theme,
  };
}

/**
 * Split a stylesheet into its light rules and the bodies of its
 * `prefers-color-scheme: dark` blocks.
 *
 * Forcing a theme on the widget has to be done in CSS: the widget follows the
 * system preference (Tailwind's default `dark:` variant) and no API lets a page
 * lie to an iframe about that. Re-injecting one half of the sheet at the end of
 * the document wins on order without touching the widget's own source.
 *
 * Brace counting is enough for compiled Tailwind output, which has no braces
 * inside string or url() literals.
 */
function splitOnColorScheme(css: string): { light: string; dark: string } {
  const opener = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{/g;
  let light = "";
  let dark = "";
  let consumed = 0;

  for (let match = opener.exec(css); match; match = opener.exec(css)) {
    const start = match.index + match[0].length;
    let cursor = start;
    let depth = 1;
    while (cursor < css.length && depth > 0) {
      const character = css[cursor];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      cursor += 1;
    }
    light += css.slice(consumed, match.index);
    dark += css.slice(start, cursor - 1);
    consumed = cursor;
    opener.lastIndex = cursor;
  }

  return { light: light + css.slice(consumed), dark };
}

const OVERRIDE = "data-np-preview-theme";

function isOverride(node: Node) {
  const element = node as HTMLElement;
  return typeof element.hasAttribute === "function" && element.hasAttribute(OVERRIDE);
}

function applyTheme(frameDocument: Document, theme: Resolved) {
  for (const node of frameDocument.querySelectorAll(`style[${OVERRIDE}]`)) {
    node.remove();
  }

  const source = Array.from(frameDocument.querySelectorAll("style"))
    .map((sheet) => sheet.textContent ?? "")
    .join("\n");
  const halves = splitOnColorScheme(source);

  const override = frameDocument.createElement("style");
  override.setAttribute(OVERRIDE, theme);
  override.textContent = theme === "dark" ? halves.dark : halves.light;
  frameDocument.head.append(override);
}

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const [theme, setTheme] = useState<Theme>("system");
  const [system, setSystem] = useState<Resolved>("light");
  const [frame, setFrame] = useState(FRAMES[0]);
  const [asked, setAsked] = useState(0);
  const [sketches, setSketches] = useState<string[]>([]);

  const resolved: Resolved = theme === "system" ? system : theme;

  // What a host does with a size the widget asks for: grant it up to the
  // ceiling, and let the widget scroll for anything past that. A scrollbar
  // appearing here is the bug this harness is meant to catch.
  const height = Math.min(asked || frame.maxHeight, frame.maxHeight);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystem(query.matches ? "dark" : "light");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const post = useCallback((message: unknown) => {
    frameRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  // The host half of the bridge. Only the traffic the napkin generates is
  // implemented; anything else is answered with an empty result so a widget
  // that grows a new call fails visibly rather than hanging.
  useEffect(() => {
    function reply(id: unknown, result: unknown) {
      post({ jsonrpc: "2.0", id, result });
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data;
      if (message?.jsonrpc !== "2.0") return;

      switch (message.method) {
        case "ui/initialize":
          reply(message.id, {
            protocolVersion: PROTOCOL_VERSION,
            hostInfo: { name: "napkin-preview", version: "0.1.0" },
            hostCapabilities: { message: { text: {}, image: {} } },
            hostContext: hostContext(frame, resolved),
          });
          break;

        case "ui/notifications/size-changed":
          setAsked(message.params?.height ?? 0);
          break;

        case "ui/message": {
          const image = (message.params?.content ?? []).find(
            (block: { type: string }) => block.type === "image",
          );
          if (image) {
            setSketches((current) => [
              ...current,
              `data:${image.mimeType};base64,${image.data}`,
            ]);
          }
          reply(message.id, {});
          break;
        }

        default:
          if (message.id !== undefined) reply(message.id, {});
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [frame, post, resolved]);

  // Changing frame or theme is the host resizing its card, which a real host
  // tells the widget about rather than reloading it over.
  useEffect(() => {
    post({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: hostContext(frame, resolved),
    });
  }, [frame, post, resolved]);

  useEffect(() => {
    const iframe = frameRef.current;
    if (!iframe) return;

    let styles: MutationObserver | undefined;

    function attach() {
      const frameDocument = iframe?.contentDocument;
      if (!frameDocument) return;

      applyTheme(frameDocument, resolved);

      // Vite pushes CSS edits by injecting fresh <style> elements, which land
      // after the override and would otherwise take the system theme back.
      styles = new MutationObserver((records) => {
        const ours = records.every((record) =>
          Array.from(record.addedNodes).every(isOverride),
        );
        if (!ours) applyTheme(frameDocument, resolved);
      });
      styles.observe(frameDocument.head, { childList: true });
    }

    iframe.addEventListener("load", attach);
    if (iframe.contentDocument?.readyState === "complete") attach();

    return () => {
      iframe.removeEventListener("load", attach);
      styles?.disconnect();
    };
  }, [resolved]);

  return (
    <div className="np-root" data-theme={resolved}>
      <div className="np-bar">
        <span className="np-bar-label">host preview</span>
        <div className="np-group">
          {THEMES.map((option) => (
            <button
              key={option}
              className="np-chip"
              data-active={theme === option}
              onClick={() => setTheme(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="np-group">
          {FRAMES.map((option) => (
            <button
              key={option.label}
              className="np-chip"
              data-active={frame.label === option.label}
              onClick={() => setFrame(option)}
            >
              {option.label} {option.width}×{option.maxHeight}
            </button>
          ))}
        </div>
        <span className="np-spacer" />
        <span className="np-bar-label">
          frame {frame.width}×{height} — asked {asked || "—"}
        </span>
      </div>

      <div className="np-thread">
        <div className="np-user">
          I keep describing this layout badly. Can I just draw it for you?
        </div>
        <p className="np-assistant">
          Of course — here&apos;s a napkin. Sketch the layout however rough you like
          and send it over, and I&apos;ll work from that.
        </p>
        <div className="np-card" style={{ width: frame.width }}>
          <div className="np-card-head">
            <span className="np-dot" />
            Napkin
          </div>
          <iframe
            ref={frameRef}
            className="np-frame"
            style={{ height }}
            src="/index.html"
            title="Napkin widget"
          />
        </div>

        {/* Where the sketch lands: the host posts it into the thread as the
            user's own message, so the harness shows it the same way. */}
        {sketches.map((sketch) => (
          <img key={sketch} className="np-sketch" src={sketch} alt="Sent sketch" />
        ))}
      </div>

      <div className="np-composer">
        <div className="np-field">
          Message Codex
          <span className="np-send">↑</span>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
);
