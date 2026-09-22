import { useState } from "react";
import { useMcpApp } from "./use-mcp-app";

const TONES = ["plain", "formal", "enthusiastic"] as const;

type View = "main" | "about";

export function Widget() {
  // Views live inside the bundle. The host renders this HTML in a sandboxed
  // iframe under its own origin, so there is no server to navigate to.
  const [view, setView] = useState<View>("main");

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-8 py-12">
        {view === "main" ? <MainView onNavigate={setView} /> : <AboutView onNavigate={setView} />}
      </main>
    </div>
  );
}

function MainView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const { connected, toolInput, toolResult, callTool } = useMcpApp();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = (toolResult ?? toolInput) as {
    name?: string;
    tone?: string;
    greeting?: string;
  } | null;

  async function onPickTone(tone: string) {
    if (!state?.name) return;
    setPending(tone);
    setError(null);
    try {
      await callTool("set_tone", { name: state.name, tone });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          MCP App boilerplate
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This is the widget MCP hosts render in a sandboxed iframe next to a
          tool result. It ships as one self-contained HTML file.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Widget state
        </p>
        <p className="mt-2 text-2xl text-zinc-900 dark:text-zinc-100">
          {state?.greeting ?? "Call the greet tool to populate this."}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {TONES.map((tone) => (
            <button
              key={tone}
              onClick={() => onPickTone(tone)}
              disabled={!connected || !state?.name || pending !== null}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {pending === tone ? `${tone}…` : tone}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </section>

      <nav className="flex flex-col gap-3">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          Navigation inside the iframe
        </p>
        <button
          onClick={() => onNavigate("about")}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          About &rarr;
        </button>
      </nav>

      <footer className="flex flex-col gap-1 text-xs text-zinc-400 dark:text-zinc-500">
        <p>
          MCP endpoint: <code>/mcp</code>
        </p>
        <p>
          {connected
            ? "Connected to MCP host"
            : "Not connected — open this through an MCP host to connect"}
        </p>
      </footer>
    </>
  );
}

function AboutView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <>
      <button
        onClick={() => onNavigate("main")}
        className="self-start text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        &larr; Back
      </button>

      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        About
      </h1>

      <div className="flex flex-col gap-4 text-zinc-600 dark:text-zinc-400">
        <p>
          This view exists to show that moving between screens keeps working
          inside a host&apos;s sandboxed iframe, which is the part most likely to
          break when a widget grows beyond a single screen.
        </p>
        <p>
          Because the bundle is self-contained, switching views fetches nothing.
          The <code className="text-zinc-800 dark:text-zinc-200">useMcpApp</code>{" "}
          hook keeps one bridge to the host alive for the whole session, so the
          tool result is still there when you come back.
        </p>
      </div>
    </>
  );
}
