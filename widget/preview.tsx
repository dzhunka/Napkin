/**
 * Dev-only preview: the widget inside a mock chat transcript.
 *
 * The widget is never seen on its own — a host renders it mid-conversation, in
 * a card the host sizes, against the host's own theme. Iterating on it as a
 * standalone page at full viewport width judges it in conditions it never
 * actually meets.
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

/** Hosts give an app a column, not a window. These bracket the realistic range. */
const WIDTHS = [
  { label: "sidebar", value: 380 },
  { label: "default", value: 560 },
  { label: "wide", value: 720 },
];

const THEMES: Theme[] = ["system", "light", "dark"];

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

/**
 * The frame is sized to its content, so a scrollbar should never appear — but
 * the collapse-and-measure pass briefly overflows, and on a system set to
 * always-visible scrollbars the gutter then sticks and quietly takes 15px off
 * the widget's width. Every judgement about the layout would be made at the
 * wrong one.
 */
const FRAME_RESET = "html{scrollbar-width:none}";

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
  override.textContent = `${FRAME_RESET}\n${theme === "dark" ? halves.dark : halves.light}`;
  frameDocument.head.append(override);
}

function Harness() {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const heightRef = useRef(0);

  const [theme, setTheme] = useState<Theme>("system");
  const [system, setSystem] = useState<Resolved>("light");
  const [width, setWidth] = useState(WIDTHS[1].value);

  const resolved: Resolved = theme === "system" ? system : theme;

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystem(query.matches ? "dark" : "light");
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  /**
   * Mirror the host's `autoResize`: the card is as tall as the widget's
   * content. Collapsing first matters because the widget's `min-h-screen`
   * floor is the frame's current height, so a measurement taken without it
   * can only ever grow.
   */
  const fit = useCallback(() => {
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument) return;

    const previous = frame.style.height;
    frame.style.height = "0px";
    const measured = frameDocument.documentElement.scrollHeight;
    frame.style.height = measured === heightRef.current ? previous : `${measured}px`;
    heightRef.current = measured;
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let content: ResizeObserver | undefined;
    let styles: MutationObserver | undefined;

    function attach() {
      const frameDocument = frame?.contentDocument;
      if (!frameDocument) return;

      applyTheme(frameDocument, resolved);
      fit();

      content = new ResizeObserver(() => fit());
      content.observe(frameDocument.documentElement);

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

    frame.addEventListener("load", attach);
    if (frame.contentDocument?.readyState === "complete") attach();

    return () => {
      frame.removeEventListener("load", attach);
      content?.disconnect();
      styles?.disconnect();
    };
  }, [fit, resolved]);

  useEffect(() => {
    const frame = requestAnimationFrame(fit);
    return () => cancelAnimationFrame(frame);
  }, [fit, width]);

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
          {WIDTHS.map((option) => (
            <button
              key={option.label}
              className="np-chip"
              data-active={width === option.value}
              onClick={() => setWidth(option.value)}
            >
              {option.label} {option.value}
            </button>
          ))}
        </div>
        <span className="np-spacer" />
        <span className="np-bar-label">dev harness — not part of the bundle</span>
      </div>

      <div className="np-thread">
        <div className="np-user">
          I keep describing this layout badly. Can I just draw it for you?
        </div>
        <p className="np-assistant">
          Of course — here&apos;s a napkin. Sketch the layout however rough you like
          and send it over, and I&apos;ll work from that.
        </p>
        <div className="np-card" style={{ maxWidth: width }}>
          <div className="np-card-head">
            <span className="np-dot" />
            Napkin
          </div>
          <iframe
            ref={frameRef}
            className="np-frame"
            src="/index.html"
            title="Napkin widget"
          />
        </div>
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
