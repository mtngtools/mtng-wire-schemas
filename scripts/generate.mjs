// generate — the TypeScript half of the cross-language wire contract (ADR-0005).
//
// Walks src/messages/, emits one JSON Schema per authored message into schemas/, and deletes
// any schema whose message no longer exists. The .NET side then mirrors schemas/ into C# with
// NJsonSchema; both generated sides are committed and guarded by `git diff --exit-code`, so
// neither language can drift from this source.
//
// AUTHORSHIP IS NOT EXPORT (mtng-dotnet-mono ADR-0026). This walks the message modules rather
// than the allow-list barrel, because every wire message is mirrored into C# while
// src/index.ts curates only which types TypeScript consumers receive. Reading the barrel here
// fused the two, and the fusion is how hand-authored C# wire types accumulated outside the
// drift gate: a message the barrel did not name had no schema, so it had to be written twice.
//
// What counts as a message is therefore "a PascalCase Zod export under src/messages/" — the
// convention this repo already keeps, where a piece is camelCase (timerClock,
// windowSlotContentTimer) and a message is PascalCase. Nothing to remember and nothing to
// register: a message cannot be authored here and silently left unmirrored.
//
// Run with plain `node` — no build step. Node strips the TypeScript types on import, so the
// authored .ts source is what actually runs, and there is no compiled copy to fall out of date.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "schemas");
const messagesDir = join(root, "src", "messages");

/** Every `.ts` under src/messages/, deepest-first order irrelevant — the emit is sorted by name. */
const messageModules = async (dir) => {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await messageModules(path)));
    } else if (entry.name.endsWith(".ts")) {
      found.push(path);
    }
  }

  return found;
};

/**
 * A message is a PascalCase Zod export. Everything else a module exports is a piece — the
 * envelope factories, the shared vocabularies, the config dialect's shapes — and pieces mirror
 * into C# scoped to the message that embeds them rather than as classes of their own.
 */
const isMessageName = (name) => /^[A-Z]/.test(name);

/** `TimerStateChanged` -> `timer-state-changed`, the schema file's name. */
const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();

/**
 * Wrap a message's schema as a document with a single named definition behind a `$ref`.
 *
 * The .NET generator takes that definition's name as the C# class name, so this wrapper is what
 * carries `TimerStateChanged` across the language boundary — an unwrapped schema would arrive
 * anonymous. Zod hoists nothing into `$defs` here (no message uses `.meta({ id })`), so the one
 * definition is the whole message.
 */
const wrap = (name, schema) => {
  const { $schema, ...body } = z.toJSONSchema(schema, { target: "draft-7" });

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $ref: `#/definitions/${name}`,
    definitions: { [name]: body },
  };
};

const collected = new Map();
for (const modulePath of await messageModules(messagesDir)) {
  const module = await import(pathToFileURL(modulePath).href);
  for (const [name, value] of Object.entries(module)) {
    if (!isMessageName(name) || !(value instanceof z.ZodType)) {
      continue;
    }

    const where = relative(root, modulePath).split(sep).join("/");
    const already = collected.get(name);
    if (already !== undefined && already.schema !== value) {
      // Two modules exporting one name would emit one file from whichever import won the race,
      // and the loser would vanish with nothing said. A re-export of the same schema object is
      // fine and common; two different schemas under one name is not.
      console.error(`generate: ${name} is exported by both ${already.where} and ${where}.`);
      process.exit(1);
    }

    collected.set(name, { schema: value, where });
  }
}

const messages = [...collected]
  .map(([name, { schema }]) => [name, schema])
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

if (messages.length === 0) {
  console.error("generate: src/messages/ exports no PascalCase Zod schemas — nothing to emit.");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

// Start from what is on disk so a deleted or renamed message has its schema removed rather
// than left behind: the deletion then shows up in the consumers' drift gates too.
const emitted = new Set(messages.map(([name]) => `${kebab(name)}.schema.json`));
for (const stale of await readdir(outDir)) {
  if (stale.endsWith(".schema.json") && !emitted.has(stale)) {
    await rm(join(outDir, stale));
    console.error(`generate: removed ${stale} (no longer authored)`);
  }
}

for (const [name, schema] of messages) {
  const file = `${kebab(name)}.schema.json`;
  await writeFile(join(outDir, file), `${JSON.stringify(wrap(name, schema), null, 2)}\n`);
  console.error(`generate: ${name} -> schemas/${file}`);
}
