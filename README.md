# MCP App plugin boilerplate

A deployable starting point for an **agent plugin whose core is an MCP App** — a
remote MCP server that ships an interactive HTML widget the host renders next to
the tool result. One repo covers both halves:

| Layer | Where | What it is |
| --- | --- | --- |
| MCP App | `app/mcp/route.ts` + `widget/` | A Next.js route serving a remote MCP server, and the widget it hands the host |
| Plugin package | `plugin.json`, `mcp.json`, `skills/` | [Agent Plugins 1.0.0](https://agent-plugins.org/specification) package that installs into Cursor, Codex, and Claude Code |

This is a GitHub template repository — click **Use this template**, or copy the
directory, to start a project from it. Nothing here is bound to a particular
deployment: `mcp.json` and `.mcp.json` ship with a `replace-me.example.com`
placeholder so a project that forgets to set its own endpoint fails loudly
instead of silently talking to someone else's server.

## How the MCP App works

MCP Apps is [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp),
stable since 2026-01-26 and identified as `io.modelcontextprotocol/ui`. Three
things wire it together:

1. A resource with a `ui://` URI and MIME type `text/html;profile=mcp-app`
   returns the widget's HTML.
2. A tool points at that resource through `_meta.ui.resourceUri`.
3. The host renders the HTML in a sandboxed iframe and speaks MCP JSON-RPC to it
   over `postMessage`.

The widget is **not served as a web page**. Its HTML travels as text inside the
JSON-RPC response, and the host injects it into an iframe under the host's own
origin. Your deployment is never navigated to — it only answers `/mcp`.

That is why this repo has two builds and one deployment. Next.js is the server:
it terminates Streamable HTTP, runs your tools, and serves resources. The widget
is a Vite app compiled into a **single self-contained HTML file**, which the MCP
route reads off disk and returns as the resource.

Inlining everything is deliberate. Host sandboxes enforce a CSP that restricts
which origins a widget may load subresources from, and a widget that fetches
nothing works on every host regardless of that policy. It also removes the
failure mode where a widget renders as readable but unstyled and inert. See
[DECISIONS.md](./DECISIONS.md) for the measurements behind this.

```
app/
  mcp/route.ts          MCP server — tools + the ui:// resource
widget/
  index.html            Vite entry
  main.tsx              React root
  app.tsx               the widget UI
  use-mcp-app.ts        the host bridge: tool input, tool result, callTool
  styles.css            Tailwind
  dist/index.html       built bundle (generated, gitignored)
vite.config.mts         single-file widget build
proxy.ts                CORS headers, so browser-based MCP clients can connect
scripts/dev-codex.mjs   isolated Codex instance with this plugin installed
scripts/test-client.mjs protocol smoke test
scripts/set-endpoint.mjs writes your deployment URL into both manifests
scripts/capture-seed-thread.mjs captures one of your threads as a seed fixture
scripts/fixtures/         seed threads the isolated instance starts with
```

### The two kinds of tool

The demo registers both, because real MCP Apps need both:

- **`greet`** is model-visible. The agent calls it, and the host opens the widget.
- **`set_tone`** is declared `visibility: ["app"]`, so it is hidden from the
  model and exists only for the widget to call when the user clicks a button.
  The widget invokes it through `callTool` from `useMcpApp()`.

## Develop

Requires macOS with the Codex desktop app, and Node 22.12+ (Vite 8).

```sh
pnpm install
pnpm dev
```

`pnpm dev` is the whole loop. It builds the widget, starts a Vite watcher and the
Next.js dev server on port 3100, installs this repo as the only local plugin in a
**throwaway Codex instance**, points that plugin at `http://127.0.0.1:3100/mcp`,
and launches a separate Codex desktop window. Closing the window removes the
isolated state. Your everyday Codex install is untouched.

No tunnel is required, because the widget requests no subresources. Because each
run gets a fresh Codex instance, its widget cache starts empty, so you see the
current bundle without bumping `UI_VERSION`.

### Seed threads

A fresh instance also starts with an empty thread list, which means retyping the
same setup before every test. `scripts/fixtures/codex-dev-seed-thread-*` holds
conversations that `pnpm dev` replays into the isolated instance, so they are
waiting in the thread list, ready to continue. The one shipped here establishes
that you are Ada and that greetings go through the app, so "greet me" opens the
widget on the first turn.

Capture your own from a thread you have already had:

```sh
pnpm capture-thread --last                    # or: pnpm capture-thread <thread-id>
pnpm capture-thread <thread-id> --name my-case --description "what it sets up"
```

Capturing rewrites your home directory, Codex home, and working directory into
placeholders that the harness substitutes at seed time. It does not rewrite the
conversation, so read a fixture before committing it.

For server-only work, or to check the protocol:

```sh
pnpm dev:server               # Vite watcher + Next.js on port 3000
pnpm test:client              # verifies the protocol against localhost:3000
```

`pnpm test:client` connects as a UI-capable client and asserts the parts that are
easy to get subtly wrong: the extension capability, the `ui://` metadata on the
tool, the resource MIME type, that the resource is real HTML, and that the bundle
is self-contained.

## Build your own plugin

The work happens in three places:

1. **`app/mcp/route.ts`** — replace `greet`/`set_tone` with your tools. Bump
   `UI_VERSION` whenever you ship a widget change, or hosts will serve a cached
   copy.
2. **`widget/app.tsx`** — your widget. Read state from `useMcpApp()`.
3. **`skills/<name>/SKILL.md`** — teach agents when to call your tools. The
   `description` is all an agent sees before loading the file, so it has to name
   concrete triggers.

## Rename it for a new project

The boilerplate name survives in five places:

| File | What to change |
| --- | --- |
| `plugin.json` | `name`, `description` |
| `.claude-plugin/plugin.json` | `name`, `description` |
| `mcp.json` and `.mcp.json` | the `mcpServers` key |
| `skills/mcp-app-boilerplate/` | directory name and the `name` frontmatter — they must match, or the skill is rejected |
| `app/mcp/route.ts`, `widget/use-mcp-app.ts`, `package.json` | `serverInfo.name`, the widget's client name, `name` |

The endpoint URL is the one thing you can't set until you've deployed, so leave
it and run `pnpm set-endpoint` afterwards.

## Deploy

```sh
pnpm build                                           # widget bundle, then Next.js
vercel deploy --prod
pnpm set-endpoint https://your-project.vercel.app    # updates both manifests
pnpm test:client   https://your-project.vercel.app
```

`next.config.ts` lists the widget bundle in `outputFileTracingIncludes` so the
serverless function can read it at runtime. If you move the bundle, update that
path too, or production will fail to serve the resource.

## Install the plugin

The plugin root is the repository root, and both manifests describe the same
package; distribute it as a git repo. Run `pnpm set-endpoint` first — installing
while the placeholder URL is still in place gives you a plugin whose MCP server
never connects.

**Cursor** natively supports Agent Plugins. Add the repo through
**Customize → Plugins**, which reads the root `plugin.json`.

**Codex** (0.147+) reads the portable root `plugin.json` and `mcp.json`:

```sh
codex plugin marketplace add <your-org>/<your-repo>
codex plugin add <plugin-name>@<marketplace>
codex plugin list --json
```

**Claude Code** does not yet parse the Agent Plugins `$schema`, so it reads the
parallel `.claude-plugin/plugin.json` and `.mcp.json` committed here. Its
`skills/` discovery is the same directory, so the skill is shared:

```sh
claude plugin marketplace add <your-org>/<your-repo>
```

To connect only the MCP server without the plugin wrapper, any host that speaks
Streamable HTTP can point at the endpoint directly:

```sh
claude mcp add --transport http my-plugin https://your-project.vercel.app/mcp
```

## Stack

- `mcp-handler` 2 — framework-agnostic MCP HTTP adapter, serves the 2026-07-28
  protocol natively with a fallback for 2025-era Streamable HTTP clients
- `@modelcontextprotocol/server` 2 and `@modelcontextprotocol/ext-apps` 2 —
  MCP SDK v2 plus the MCP Apps helpers (`registerAppTool`, `registerAppResource`)
- Vite 8 with `vite-plugin-singlefile` and Tailwind 4 — the widget bundle
- Next.js 16 on Vercel Fluid Compute — the MCP server

Derived from [`vercel-labs/mcp-apps-nextjs-starter`](https://github.com/vercel-labs/mcp-apps-nextjs-starter),
upgraded to the v2 MCP stack, packaged as an Agent Plugin, and moved to a
self-contained widget bundle.
