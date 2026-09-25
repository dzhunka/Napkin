# Napkin

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/icon-dark.svg">
    <img src="./assets/icon.svg" alt="Napkin logo" width="160">
  </picture>
</p>

A blank napkin for your agent. It sketches nothing — you do.

[Website](https://napkin-neon.vercel.app) · [Privacy](https://napkin-neon.vercel.app/privacy) · [Terms](https://napkin-neon.vercel.app/terms) · [Issues](https://github.com/enkind/napkin/issues)

Napkin is a small, free agent plugin whose core is an **MCP App**: a remote MCP
server that ships an interactive widget the host renders next to the tool
result. The agent calls one tool, a sheet of paper appears in the conversation,
you draw on it, press Send, and the drawing arrives as an image in your next
message.

It exists because the alternative is worse. Describing a shape in words is slow
and lossy, and the workaround — pick up a real napkin, draw on it, photograph it,
upload the photo — works but costs a detour through your phone every time. Some
directions are only five seconds of pen: a logo that should feel *like a mountain
but rounder*, which panel sits where, how three boxes connect.

Questions and bug reports go to the issue tracker; support is best-effort on a
noncommercial project. MIT licensed.

## Install

Paste this into Codex, Cursor, or Claude Code, then start a new chat:

```text
Install the Napkin plugin from https://github.com/enkind/napkin
```

Or do what the agent would do. The repository is a marketplace containing one
plugin, `plugins/napkin`, for each host:

```sh
# Codex
codex plugin marketplace add enkind/napkin
codex plugin add napkin@napkin

# Claude Code
claude plugin marketplace add enkind/napkin
claude plugin install napkin@napkin
```

In **Cursor**, add `https://github.com/enkind/napkin.git` as a marketplace
through **Customize → Plugins** and install Napkin from it.

There is no account and no key. Every host connects to the same Streamable HTTP
endpoint, `https://napkin-neon.vercel.app/mcp`; nothing runs locally. The napkin
needs a host that renders MCP Apps and accepts images from them. Where one does
not, the widget says so and Send stays disabled.

## Repository standard

Napkin follows the same recipe as its sibling plugin, Better Response: one
deployment that is both the website and the MCP server, and one directory that
is everything a host installs.

```text
app/                 Website, /demo, and the Streamable HTTP MCP route at /mcp
widget/              The napkin: a Vite app built into one self-contained HTML file
plugins/napkin/      Installable skill, host manifests, logo, and MCP URL
```

The remaining dotfolders are host entrypoints, not competing layouts:

```text
.agents/plugins/marketplace.json     Codex repository marketplace
.cursor-plugin/marketplace.json      Cursor repository marketplace
.claude-plugin/marketplace.json      Claude Code repository marketplace
.cursor/mcp.json                     Cursor CLI localhost HTTP configuration
plugins/napkin/.codex-plugin/        Codex manifest, with the logo and store metadata
plugins/napkin/.cursor-plugin/       Cursor manifest, which carries its own MCP URL
plugins/napkin/.claude-plugin/       Claude Code manifest
plugins/napkin/.mcp.json             MCP URL for Codex and Claude Code
```

The manifests and marketplace catalogs cannot be merged because each host
requires its own paths and schema. All of them describe the same plugin
directory, so a host installs a ~20K payload rather than this repository.
`pnpm set-endpoint <url>` rewrites the MCP URL in both places it lives.

The widget is built into the ignored `widget/dist/index.html` immediately before
Next.js builds. `/mcp` serves it as the `ui://` resource, and `/demo` serves the
same file as a page so the website's chat mock can host the real napkin rather
than a picture of one. Both routes list it in `outputFileTracingIncludes`.

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
printed on the paper, like "rough logo direction".

`plugins/napkin/skills/napkin/SKILL.md` teaches agents when to reach for it, and
— just as importantly — that after calling it they should say something brief
and then wait rather than narrate a drawing that does not exist yet. Users can
also ask for it directly with `/napkin`.

## How the MCP App works

MCP Apps is [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp),
stable since 2026-01-26 and identified as `io.modelcontextprotocol/ui`. A
resource with a `ui://` URI and MIME type `text/html;profile=mcp-app` returns the
widget's HTML, the tool points at it through `_meta.ui.resourceUri`, and the host
renders it in a sandboxed iframe and speaks MCP JSON-RPC to it over
`postMessage`.

The widget's HTML travels as text inside the JSON-RPC response, and the host
injects it into an iframe under its own origin. Host sandboxes enforce a CSP
that restricts which origins a widget may load subresources from, so the widget
is compiled into a **single self-contained HTML file** that fetches nothing and
works on every host regardless of that policy. See DECISIONS 001.

```text
app/
  page.tsx              the website
  chat-window.tsx       the chat-client mock around the live napkin
  napkin-card.tsx       the page acting as the napkin's MCP Apps host
  styles.css            the site's design language and its two rules
  privacy/ terms/ support/
  demo/route.ts         the widget bundle, served as a page for the mock
  mcp/route.ts          MCP server — open_napkin + the ui:// resource
  .well-known/openai-apps-challenge/route.ts   plugin-directory domain check
widget/
  app.tsx               the napkin: canvas, pen, Send
  use-mcp-app.ts        the host bridge, including the negotiated image route
  use-napkin-size.ts    how big the paper is and which way round it lies
  preview.tsx           dev-only mock host with measured frames
vite.config.mts         single-file widget build
proxy.ts                CORS headers, so browser-based MCP clients can connect
scripts/dev-web.mjs     watched widget + Next.js, and shared process cleanup
scripts/dev-codex.mjs   isolated Codex instance with this plugin installed
scripts/dev-cursor.mjs  isolated Cursor instance with this plugin installed
scripts/test-client.mjs protocol smoke test
scripts/set-endpoint.mjs writes a deployment URL into the plugin
scripts/capture-seed-thread.mjs captures one of your threads as a seed fixture
```

### The canvas

The paper is a golden rectangle — 1024×633 lying down, 633×1024 standing up —
and which way round it lies comes from the host: landscape on a desktop,
portrait on a phone unless the phone is turned on its side. Its size on screen
is chosen against the host's frame rather than against the widget's own width,
so the napkin fills the card without asking for more height than the card has.

How much height there is cannot simply be read: Codex answers that question by
measuring the container the widget is already in, which is the size the widget
last asked for, and a napkin that believes it shrinks itself away. So the
ceiling is discovered instead — ask for the size the paper wants, and let the
host refuse by clamping, which shows up here as a document taller than its own
viewport. See [DECISIONS 003](./DECISIONS.md).

The pixel buffer is fixed per orientation while CSS decides the rendered size,
so a layout change never wipes a drawing and every napkin submits at the same
resolution. The nib is deliberately bolder than a real pen at that size, because
models downscale images before reading them and a hairline does not survive it.
The paper is painted rather than left transparent — a transparent PNG composited
onto a dark background hides the ink completely.

## Verify

Requires Node 22.12+ (Vite 8).

```sh
pnpm install
pnpm lint
pnpm build                    # widget, typecheck, then Next.js
pnpm dev:server               # widget watcher + Next.js on port 3000
pnpm test:client              # verifies the protocol against localhost:3000
```

`pnpm test:client` connects as a UI-capable client and asserts the parts that are
easy to get subtly wrong: the extension capability, the `ui://` metadata on the
tool, the resource MIME type, that the resource is real HTML, that the bundle is
self-contained, and that it still carries a canvas and a PNG export.

For site changes, open `http://localhost:3000` in both colour schemes and draw on
the napkin in the chat mock: pressing Send should post the sketch into the
mock's thread, the same way a host posts it into yours.

Bump `UI_VERSION` in `app/mcp/route.ts` whenever you ship a widget change, or
hosts will serve a cached copy. [AGENTS.md](./AGENTS.md) lists every version
that moves with a release.

## Develop through Codex

```sh
pnpm dev
```

`pnpm dev:codex` is the same command, and it requires macOS with the Codex
desktop app. It builds the widget, starts a Vite watcher and the Next.js dev
server on port 3100, installs a copy of `plugins/napkin` pointed at
`http://127.0.0.1:3100/mcp` as the only local plugin in a **throwaway Codex
instance**, and launches a separate Codex desktop window. Closing the window
removes the isolated state. Your everyday Codex install is untouched.

No tunnel is required, because the widget requests no subresources. Because each
run gets a fresh Codex instance, its widget cache starts empty, so you see the
current bundle without bumping `UI_VERSION`.

A fresh instance also starts with an empty thread list. `pnpm capture-thread`
captures a real conversation into `scripts/fixtures/` so `pnpm dev` replays it
into the isolated instance, ready to continue — useful here, since testing
Napkin means first getting to a point where a sketch would help:

```sh
pnpm capture-thread --last                    # or: pnpm capture-thread <thread-id>
pnpm capture-thread <thread-id> --name logo-brief --description "what it sets up"
```

Capturing rewrites your home directory, Codex home, and working directory into
placeholders that the harness substitutes at seed time. It does not rewrite the
conversation, so read a fixture before committing it.

To update the personal Codex installation explicitly instead, add a `napkin`
entry pointing at `./plugins/napkin` to `~/.agents/plugins/marketplace.json`
once, then:

```sh
pnpm install:codex
```

That mirrors the plugin into `~/plugins/napkin`, applies the Codex cachebuster,
and reinstalls `napkin@personal`.

## Develop through Cursor

```sh
pnpm dev:cursor
```

The Cursor equivalent: the same watched server on port 3100, plus a separate
Cursor desktop instance with a persistent isolated profile under
`~/.napkin/cursor-dev`. Cursor loads local plugins from
`~/.cursor/plugins/local` whatever the profile, so the launcher points that
Napkin install at localhost for the session and restores the production plugin
when you close the isolated window. Skill edits are copied into it as you save;
start a new chat to load them.

To update the everyday Cursor installation explicitly instead:

```sh
mkdir -p "$HOME/.cursor/plugins/local"
pnpm install:cursor
```

Do not keep a marketplace-installed Napkin enabled alongside the local copy.

## Widget-only work

```sh
pnpm dev:preview              # http://localhost:5173/preview.html
```

The preview puts the widget in a mock transcript and speaks enough of the wire
protocol to act as its host: it answers `ui/initialize` with one of the measured
frames, sizes the iframe from the widget's own resize notifications and clamps
it the way a real host does, and accepts the finished sketch through
`ui/message`. Switching frames exercises the sizing without a rebuild; a
scrollbar appearing inside the card is a bug.

## Deploy

Every push to `main` deploys to production through
`.github/workflows/deploy.yml`. Vercel's own Git integration cannot deploy an
organization repository on a Hobby team, so it is disconnected and the workflow
builds with the project's settings (`vercel pull`, `vercel build`) and uploads
the prebuilt output, then runs the protocol smoke test against production. It
needs three repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and
`VERCEL_PROJECT_ID`. Run it again from the Actions tab with **Run workflow**.

Pull requests get no preview deployments. To deploy by hand, or to a project of
your own:

```sh
pnpm build
vercel deploy --prod
pnpm set-endpoint https://your-project.vercel.app    # only for a new domain
pnpm test:client   https://your-project.vercel.app
```

## Scope

Napkin is a free, noncommercial project in pre-release `0.x`. Breaking contract
changes advance the minor version; `1.0.0` is reserved for the public release.

## Stack

- `mcp-handler` 2 — framework-agnostic MCP HTTP adapter, serves the 2026-07-28
  protocol natively with a fallback for 2025-era Streamable HTTP clients
- `@modelcontextprotocol/server` 2 and `@modelcontextprotocol/ext-apps` 2 —
  MCP SDK v2 plus the MCP Apps helpers (`registerAppTool`, `registerAppResource`)
- Vite 8 with `vite-plugin-singlefile` and Tailwind 4 — the widget bundle
- Next.js 16 on Vercel Fluid Compute — the website and the MCP server
