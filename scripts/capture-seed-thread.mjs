/**
 * Capture a Codex thread from your own Codex home into a seed fixture that
 * `pnpm dev` replays into the isolated instance.
 *
 *   node scripts/capture-seed-thread.mjs <thread-id> [--name slug] [--description text]
 *   node scripts/capture-seed-thread.mjs --last
 *
 * Machine-specific paths are replaced with placeholders, so the fixture stays
 * portable enough to commit.
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const codexHome = process.env.CODEX_HOME?.trim() || path.join(homedir(), ".codex");
const fixturesRoot = path.join(repositoryRoot, "scripts", "fixtures");

const cwdPlaceholder = "__CWD__";
const codexHomePlaceholder = "__CODEX_HOME__";
const homePlaceholder = "__HOME__";

function readOption(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Rollouts live under `sessions/<yyyy>/<mm>/<dd>/`, archived ones alongside. */
async function listRollouts() {
  const rollouts = [];
  for (const root of [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")]) {
    let entries;
    try {
      entries = await readdir(root, { recursive: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl") || !path.basename(entry).startsWith("rollout-")) continue;
      rollouts.push(path.join(root, entry));
    }
  }
  return rollouts;
}

async function resolveRollout() {
  const rollouts = await listRollouts();
  if (rollouts.length === 0) {
    throw new Error(`No rollouts found under ${codexHome}.`);
  }

  if (process.argv.includes("--last")) {
    const timed = await Promise.all(
      rollouts.map(async (file) => ({ file, mtimeMs: (await stat(file)).mtimeMs })),
    );
    timed.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return timed[0].file;
  }

  const threadId = process.argv[2];
  if (!threadId || threadId.startsWith("--")) {
    throw new Error("Pass a thread id, or --last to capture the most recent thread.");
  }
  const match = rollouts.find((file) => path.basename(file).endsWith(`-${threadId}.jsonl`));
  if (!match) {
    throw new Error(`No rollout for thread ${threadId} under ${codexHome}.`);
  }
  return match;
}

async function readThreadName(threadId) {
  try {
    const index = await readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
    for (const line of index.split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      if (entry.id === threadId && entry.thread_name) return entry.thread_name;
    }
  } catch {
    // The index is optional; fall back to the first user message.
  }
  return undefined;
}

/** The first thing the user actually typed, past the injected context items. */
function findUserMessage(events) {
  for (const event of events) {
    const item = event.payload?.item;
    if (event.payload?.type !== "item_completed" || item?.type !== "UserMessage") continue;
    const text = item.content?.find((part) => part.type === "text")?.text;
    if (text) return text.trim();
  }
  return undefined;
}

const rolloutPath = await resolveRollout();
const raw = await readFile(rolloutPath, "utf8");
const events = raw
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const sessionMeta = events.find((event) => event.type === "session_meta")?.payload;
if (!sessionMeta) {
  throw new Error(`${rolloutPath} has no session_meta line.`);
}

const threadId = sessionMeta.session_id ?? sessionMeta.id;
const threadCwd = sessionMeta.cwd;
const userMessage = findUserMessage(events);
const threadName = (await readThreadName(threadId)) ?? userMessage?.slice(0, 48) ?? threadId;
const slug = slugify(readOption("--name") ?? threadName);
const fixtureRoot = path.join(fixturesRoot, `codex-dev-seed-thread-${slug}`);

// Longest path first, so a cwd nested inside the Codex home still resolves to
// the more specific placeholder.
const substitutions = [
  [threadCwd, cwdPlaceholder],
  [codexHome, codexHomePlaceholder],
  [homedir(), homePlaceholder],
].filter(([value]) => value).sort((a, b) => b[0].length - a[0].length);

let scrubbed = raw;
for (const [value, placeholder] of substitutions) {
  scrubbed = scrubbed.replaceAll(value, placeholder);
}

await mkdir(fixtureRoot, { recursive: true });
await writeFile(path.join(fixtureRoot, "rollout.jsonl"), scrubbed);
await writeFile(
  path.join(fixtureRoot, "meta.json"),
  `${JSON.stringify(
    {
      threadId,
      threadName,
      userMessage,
      description: readOption("--description") ?? threadName,
      cwdPlaceholder,
      codexHomePlaceholder,
      homePlaceholder,
    },
    null,
    2,
  )}\n`,
);

console.log(`Captured "${threadName}" (${threadId})`);
console.log(`  from ${rolloutPath}`);
console.log(`  into ${path.relative(repositoryRoot, fixtureRoot)}`);
console.log("\nA captured thread carries whatever it discussed. Read it before committing.");
