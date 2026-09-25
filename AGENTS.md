Napkin is a free agent plugin whose core is an MCP App: the agent calls one tool, a blank napkin appears in the conversation, the user sketches on it, and the drawing reaches the agent as an image in the user's next message.

It is one of a family of plugins built on the same recipe as Better Response (`../Engawa`): one Next.js deployment serving the website and the Streamable HTTP MCP route, a self-contained widget bundle, one installable directory under `plugins/`, and host marketplaces at the repository root. Keep the recipe's shape when changing any of those; each plugin in the family differs in what it does and in its design language, not in how it is consumed.

## Product context

`README.md` describes what Napkin is and how it is consumed; `DECISIONS.md` records the host evidence behind its architecture. Before product, architecture, or implementation work, read both and treat them as the current source of truth. When an assumption, term, or scope boundary is corrected, or when measured host behavior invalidates a recorded claim, update the relevant file in the same task. A decision that is reversed gets an amendment in `DECISIONS.md`, not a silent edit.

## Implementation guardrail

Keep the code minimal, direct, and straightforward.

- Implement only the path the current task requires.
- Do not add speculative features, abstractions, extensibility, fallbacks, or general-purpose infrastructure.
- Do not introduce extra helpers, files, or dependencies unless the current path genuinely requires them.
- Prefer simple inline code when logic is used once and remains readable.
- The napkin is a pen and a Send button. An eraser, undo, colors, or shapes are scope changes, not polish.

## Agent-facing text

The tool description in `app/mcp/route.ts`, the tool result text, and `plugins/napkin/skills/sketch/SKILL.md` are agent instruction rather than internal documentation. Describe what the napkin is and does, and when it helps; do not script the conversation around it.

## Website

The site lives in `app/` beside the MCP route. Its two design rules are stated at the top of `app/styles.css`, and every addition must keep to them. The chat mock's interior values are measured from a real client and do not follow the site's identity; do not restyle them to match the page.

The napkin in the site's chat mock is the real widget bundle, framed from `/demo` and hosted by `app/napkin-card.tsx`. If the widget starts using a new part of the host bridge, extend that host in the same change, as with `widget/preview.tsx`.

## Plugin package versioning

Before committing any change that affects installed plugin files, the MCP server, or the widget, ALWAYS choose and apply a SemVer version bump. Never publish changed installable contents under an existing version, because hosts may keep a cached revision.

- Patch: fixes, packaging changes, or internal changes that preserve the public contract.
- Minor: additions or breaking contract changes while the product remains in `0.x`.
- Major: the `1.0.0` public release or a later incompatible contract change.

Keep the versions in `package.json`, all three manifests under `plugins/napkin/` (`.codex-plugin`, `.cursor-plugin`, `.claude-plugin`), `serverInfo` in `app/mcp/route.ts`, the widget's `App` in `widget/use-mcp-app.ts`, and the site's mock host in `app/napkin-card.tsx` aligned. Any change to the widget bundle also bumps `UI_VERSION` in `app/mcp/route.ts`, since hosts cache the resource by its URI. `widget/dist/` is a build artifact and must not be committed.

Website-only, root documentation, or development-only changes that do not affect installed plugin files do not require a plugin version bump.

## Verify

Run `pnpm lint`, `pnpm build`, and, against a running server, `pnpm test:client`. For site changes, check the page in a browser in both color schemes and draw on the napkin in the mock until the sketch lands in the thread.

## Local Codex CLI

For local plugin management on this Mac, use the signed CLI bundled with the app at `/Applications/ChatGPT.app/Contents/Resources/codex`. Do not invoke `/usr/local/bin/codex`; macOS blocks that standalone installation and displays a malware warning.

## Commit ownership

The agent owns committing completed work. After each coherent user-requested task that changes the repository:

- Run the required validation and review the final diff.
- Stage only the files and hunks created for that task, preserving unrelated or pre-existing work.
- Create a clear, scoped commit before reporting the task complete.
- Do not amend, rewrite, or push commits unless the user explicitly asks.

If validation fails or a clean task-only commit cannot be made safely, stop before committing and explain the blocker. A user request to leave changes uncommitted overrides this rule.
