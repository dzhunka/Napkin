# Napkin

A blank napkin for your agent. It sketches nothing — you do.

Napkin is an agent plugin whose core is an **MCP App**: a remote MCP server that
ships an interactive widget the host renders next to the tool result. The agent
calls one tool, a square of paper appears in the conversation, you draw on it,
press Send, and the drawing arrives as an image in your next message.

It exists because the alternative is worse. Describing a shape in words is slow
and lossy, and the workaround — pick up a real napkin, draw on it, photograph it,
upload the photo — works but costs a detour through your phone every time. Some
directions are only five seconds of pen: a logo that should feel *like a mountain
but rounder*, which panel sits where, how three boxes connect.

| Layer | Where | What it is |
| --- | --- | --- |
| MCP App | `app/mcp/route.ts` + `widget/` | A Next.js route serving a remote MCP server, and the napkin it hands the host |
| Plugin package | `plugin.json`, `mcp.json`, `skills/` | [Agent Plugins 1.0.0](https://agent-plugins.org/specification) package that installs into Cursor, Codex, and Claude Code |

Built from [`dzhunka/mcp-app-boilerplate`](https://github.com/dzhunka/mcp-app-boilerplate).

## What v1 is

A pen and a Send button. No eraser, no undo, no colours, no shapes, no rulers.
A napkin is the rough version of an idea, and the constraint is the point — to
change a sketch, ask for a fresh napkin.

## How the sketch gets back

This is the part worth understanding, because the obvious design does not work.

The instinct is to have the widget call a tool with the PNG and let the tool
return it. But the result of a tool the *widget* invoked goes back to the widget,
and no host is obliged to also put it in front of the model. A sketch the model
never sees is useless.

So the widget hands the image to the **host** instead, with `ui/message` and an
image content block, and the host adds it to the thread as though you had
attached the file yourself. Codex ships a localised string for exactly this —
"Shared an image from {appName}" — so it is a designed path, not a loophole.

Two consequences fall out of that, and both are good:

- **The server is stateless.** The drawing never touches the deployment. There is
  one tool, no upload route, and nothing stored, which is why this runs on
  serverless functions without a database.
- **The image lands in your own transcript.** You see what you sent, and the turn
  starts on your press rather than on the model's guess about when you are done.

The route is negotiated from the host's declared capabilities rather than
assumed. A host that takes images only as model context gets the image parked
there with a short text message as the trigger; a host that takes them nowhere
gets a disabled Send button and an honest explanation. See
[DECISIONS.md](./DECISIONS.md) for the host evidence behind this.

## The tool

`open_napkin({ brief? })` — model-visible, and the only tool. It opens the napkin
and returns, telling the agent to stop and wait. `brief` is a short reminder
printed above the paper, like "rough logo direction".

`skills/napkin/SKILL.md` teaches agents when to reach for it, and — just as
importantly — that after calling it they should say something brief and then wait
rather than narrate a drawing that does not exist yet.

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
origin. The deployment is never navigated to — it only answers `/mcp`.

That is why this repo has two builds and one deployment. Next.js is the server:
it terminates Streamable HTTP, runs the tool, and serves the resource. The napkin
is a Vite app compiled into a **single self-contained HTML file**, which the MCP
route reads off disk and returns.

Inlining everything is deliberate. Host sandboxes enforce a CSP that restricts
which origins a widget may load subresources from, and a widget that fetches
nothing works on every host regardless of that policy.

```
app/
  mcp/route.ts          MCP server — open_napkin + the ui:// resource
widget/
  index.html            Vite entry
  main.tsx              React root
  app.tsx               the napkin: canvas, pen, Send
  use-mcp-app.ts        the host bridge, including the negotiated image route
  styles.css            Tailwind
  dist/index.html       built bundle (generated, gitignored)
vite.config.mts         single-file widget build
proxy.ts                CORS headers, so browser-based MCP clients can connect
scripts/dev-codex.mjs   isolated Codex instance with this plugin installed
scripts/test-client.mjs protocol smoke test
scripts/set-endpoint.mjs writes your deployment URL into both manifests
scripts/capture-seed-thread.mjs captures one of your threads as a seed fixture
```

### The canvas

The pixel buffer is a fixed 1024×1024 square while CSS decides the rendered
size. Two reasons: resizing a canvas clears it, so pinning the buffer keeps a
layout change from wiping a drawing, and every napkin submits at the same
resolution. The nib is deliberately bolder than a real pen at that size, because
models downscale images before reading them and a hairline does not survive it.
The paper is painted rather than left transparent — a transparent PNG composited
onto a dark background hides the ink completely.

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

A fresh instance also starts with an empty thread list. `pnpm capture-thread`
captures a real conversation into `scripts/fixtures/` so `pnpm dev` replays it
into the isolated instance, waiting in the thread list and ready to continue —
useful here, since testing Napkin means first getting to a point where a sketch
would help:

```sh
pnpm capture-thread --last                    # or: pnpm capture-thread <thread-id>
pnpm capture-thread <thread-id> --name logo-brief --description "what it sets up"
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
tool, the resource MIME type, that the resource is real HTML, that the bundle is
self-contained, and that it still carries a canvas and a PNG export.

Bump `UI_VERSION` in `app/mcp/route.ts` whenever you ship a widget change, or
hosts will serve a cached copy.

## Deploy

```sh
pnpm build                                           # widget bundle, then Next.js
vercel deploy --prod
pnpm set-endpoint https://your-project.vercel.app    # updates both manifests
pnpm test:client   https://your-project.vercel.app
```

`mcp.json` and `.mcp.json` ship with a `replace-me.example.com` placeholder, so a
deployment that forgets `pnpm set-endpoint` fails loudly instead of silently
talking to someone else's server.

`next.config.ts` lists the widget bundle in `outputFileTracingIncludes` so the
serverless function can read it at runtime. If you move the bundle, update that
path too, or production will fail to serve the resource.

## Install

The plugin root is the repository root, and both manifests describe the same
package; distribute it as a git repo. Run `pnpm set-endpoint` first — installing
while the placeholder URL is in place gives you a plugin whose MCP server never
connects.

**Cursor** natively supports Agent Plugins. Add the repo through
**Customize → Plugins**, which reads the root `plugin.json`.

**Codex** (0.147+) reads the portable root `plugin.json` and `mcp.json`:

```sh
codex plugin marketplace add dzhunka/Napkin
codex plugin add napkin@Napkin
codex plugin list --json
```

**Claude Code** does not yet parse the Agent Plugins `$schema`, so it reads the
parallel `.claude-plugin/plugin.json` and `.mcp.json` committed here. Its
`skills/` discovery is the same directory, so the skill is shared:

```sh
claude plugin marketplace add dzhunka/Napkin
```

To connect only the MCP server without the plugin wrapper, any host that speaks
Streamable HTTP can point at the endpoint directly — though without a host that
renders MCP Apps and accepts images from them, there is nothing to draw on:

```sh
claude mcp add --transport http napkin https://your-project.vercel.app/mcp
```

## Stack

- `mcp-handler` 2 — framework-agnostic MCP HTTP adapter, serves the 2026-07-28
  protocol natively with a fallback for 2025-era Streamable HTTP clients
- `@modelcontextprotocol/server` 2 and `@modelcontextprotocol/ext-apps` 2 —
  MCP SDK v2 plus the MCP Apps helpers (`registerAppTool`, `registerAppResource`)
- Vite 8 with `vite-plugin-singlefile` and Tailwind 4 — the widget bundle
- Next.js 16 on Vercel Fluid Compute — the MCP server
