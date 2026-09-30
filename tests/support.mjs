// Shared loaders and samples for the suite.
//
// The suite runs under plain node — `node --test "tests/**/*.test.mjs"` — with no test dependency: node:test
// and node:assert are built in, and node strips the TypeScript types on import, so the authored
// src/*.ts is what executes, exactly as scripts/generate.mjs runs it. The test files are .mjs
// because nothing typechecks them (tsconfig includes src/ only); the schemas they exercise are
// fully typed either way.
//
// TEMPORARY AGENT DECISION APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
// node's built-in runner over .mjs files outside src/, zero new dependencies, over a vitest or @types/node devDependency with co-located .test.ts under tsc — the repo is deliberately self-contained, and the schemas under test stay fully typed either way; the cost is that the test files themselves are not typechecked
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

export const root = new URL("../", import.meta.url);

/** File name → parsed document, for every `schemas/*.schema.json`. */
export const readSchemas = async () => {
  const dir = new URL("schemas/", root);
  const out = new Map();
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".schema.json")).sort()) {
    out.set(file, JSON.parse(await readFile(new URL(file, dir), "utf8")));
  }

  return out;
};

/** The one definition a schema document wraps — what the .NET side takes as the message. */
export const definitionOf = (doc) => {
  const names = Object.keys(doc.definitions);
  assert.equal(names.length, 1, "a schema document wraps exactly one definition");

  return { name: names[0], schema: doc.definitions[names[0]] };
};

/** Depth-first over a JSON document, calling `visit(node, path)` on every object node. */
export const walk = (node, visit, path = []) => {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, visit, [...path, index]));
    return;
  }

  if (node === null || typeof node !== "object") {
    return;
  }

  visit(node, path);
  for (const [key, value] of Object.entries(node)) {
    walk(value, visit, [...path, key]);
  }
};

/** `path: message` per issue, for assertion messages. */
export const issuesOf = (result) =>
  result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

export const assertAccepts = (schema, value, note = "expected the value to validate") => {
  const result = schema.safeParse(value);
  assert.ok(result.success, `${note}\n${issuesOf(result).join("\n")}`);

  return result.data;
};

export const assertRejects = (schema, value, atPath, note = "expected the value to be rejected") => {
  const result = schema.safeParse(value);
  assert.ok(!result.success, note);
  if (atPath !== undefined) {
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    assert.ok(paths.includes(atPath), `expected an issue at '${atPath}', got:\n${issuesOf(result).join("\n")}`);
  }

  return result.error;
};

// --- samples: one valid instance of each shape, to vary from ---

export const ts = "2026-09-29T14:00:00Z";
export const later = "2026-09-29T14:30:00Z";

export const speakerSample = () => ({ spId: "sp-1", spFullName: "Ada Lovelace", spOrder: 1 });

export const calculatedPhaseSample = () => ({
  label: "Talk",
  load: "auto",
  minutes: 20,
  start: ts,
  end: "2026-09-29T14:20:00Z",
  source: "concrete",
  phaseCues: [{ label: "warn", at: 2 }],
  timerHints: [{ kind: "floor", value: 5 }],
});

export const presentationSample = () => ({
  prId: "pr-1",
  prTitle: "On Engines",
  prStart: ts,
  prEnd: later,
  prSpeakers: [speakerSample()],
  prMetadata: { track: "A" },
  prPhasesPreset: "standard",
  prPhasesCalculated: {
    phases: { talk: calculatedPhaseSample() },
    fit: { fit: "exact" },
    resolverNotes: [],
  },
});

export const fileSample = (instanceId = "lectern-1") => ({
  instanceId,
  path: { prSubDirectory: "day-1" },
});

export const pointerSample = (overrides = {}) => ({
  type: "state-changed",
  domain: "presentation",
  kind: "event",
  ts,
  phase: "talk",
  prId: "pr-1",
  actualPrStart: ts,
  enteredAt: ts,
  ...overrides,
});

export const enterSample = (overrides = {}) => ({
  type: "enter",
  domain: "presentation",
  kind: "command",
  ts,
  prId: "pr-1",
  ...overrides,
});

export const timerStateSample = (overrides = {}) => ({
  type: "state-changed",
  domain: "timer",
  kind: "event",
  ts,
  target: "presentation-phase",
  timerKind: "presentation-phase",
  clock: { lifecycle: "running", endsAt: later },
  startingValue: 1200,
  cues: [{ label: "warn", atDuration: 120 }],
  firedCues: [],
  furthestCue: "none",
  furthestCueFamily: "none",
  ...overrides,
});

export const cueFiredSample = (overrides = {}) => ({
  type: "cue-fired",
  domain: "timer",
  kind: "event",
  ts,
  target: "presentation-phase",
  label: "warn",
  ...overrides,
});
