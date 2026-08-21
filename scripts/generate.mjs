// generate — the TypeScript half of the cross-language wire contract (ADR-0005).
//
// Reads the allow-list barrel (src/index.ts), emits one JSON Schema per exported message into
// schemas/, and deletes any schema whose message is no longer allow-listed. The .NET side then
// mirrors schemas/ into C# with NJsonSchema; both generated sides are committed and guarded by
// `git diff --exit-code`, so neither language can drift from this source.
//
// Run with plain `node` — no build step. Node strips the TypeScript types on import, so the
// authored .ts source is what actually runs, and there is no compiled copy to fall out of date.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import * as allowList from "../src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "schemas");

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

const messages = Object.entries(allowList)
  .filter(([, value]) => value instanceof z.ZodType)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

if (messages.length === 0) {
  console.error("generate: src/index.ts exports no Zod schemas — the allow-list is empty.");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

// Start from what is on disk so a message dropped from the allow-list has its schema removed
// rather than left behind: the deletion then shows up in the consumers' drift gates too.
const emitted = new Set(messages.map(([name]) => `${kebab(name)}.schema.json`));
for (const stale of await readdir(outDir)) {
  if (stale.endsWith(".schema.json") && !emitted.has(stale)) {
    await rm(join(outDir, stale));
    console.error(`generate: removed ${stale} (no longer allow-listed)`);
  }
}

for (const [name, schema] of messages) {
  const file = `${kebab(name)}.schema.json`;
  await writeFile(join(outDir, file), `${JSON.stringify(wrap(name, schema), null, 2)}\n`);
  console.error(`generate: ${name} -> schemas/${file}`);
}
