// The TimerPresets document — the value under Timer:Presets — and how it reaches the mirror
// (ADR-0033 decision 6; mtngtools/mtng-dotnet-mono#734).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TimerPresets } from "../src/messages/timer/documents.ts";
import { assertAccepts, assertRejects, definitionOf, readSchemas, walk } from "./support.mjs";

const full = () => ({
  phasePresets: {
    lightning: {
      intro: { label: "Welcome", load: "clear" },
      talk: { label: "Lightning", load: "auto", cuesRef: "tight", timerHintsRef: "no-overrun" },
      qa: { load: "next", phaseCues: [{ label: "timesUp", at: 0 }] },
    },
    keynote: {
      talk: { phaseCues: [{ label: "warn", at: 10 }, { label: "warn2", at: 5, atUnits: "percent" }], timerHints: [{ kind: "remaining" }] },
    },
  },
  cueSets: {
    talk: {
      sets: {
        tight: [{ label: "warn", at: 1 }, { label: "timesUp", at: 0 }],
        standard: [{ label: "warn", at: 2 }, { label: "timesUp", at: 0 }, { label: "over", at: -1 }],
      },
      default: "standard",
    },
    qa: { sets: { standard: [{ label: "timesUp", at: 0 }] } },
  },
  hintSets: {
    talk: {
      sets: {
        "no-overrun": [{ kind: "cap", value: 100, unit: "percent" }],
        generous: [{ kind: "floor", value: 5 }, { kind: "remaining", whenPrLateBy: 10 }],
      },
      default: "generous",
    },
  },
});

test("a full document validates, and so does an empty one", () => {
  assertAccepts(TimerPresets, full());
  assertAccepts(TimerPresets, {});
  assertAccepts(TimerPresets, { cueSets: {} });
});

test("a preset body may carry refs, alone or beside an inline array", () => {
  assertAccepts(TimerPresets, { phasePresets: { p: { talk: { cuesRef: "standard", timerHintsRef: "generous" } } } });
  assertAccepts(TimerPresets, { phasePresets: { p: { talk: { cuesRef: "standard", phaseCues: [{ label: "warn", at: 1 }] } } } });
  assertRejects(TimerPresets, { phasePresets: { p: { talk: { cuesRef: "" } } } }, "phasePresets.p.talk.cuesRef");
});

test("a preset body's label may be '' — explicitly no phase name — where its keys may not be empty", () => {
  assertAccepts(TimerPresets, { phasePresets: { p: { intro: { label: "" } } } });
  assertRejects(TimerPresets, { phasePresets: { p: { intro: { timerHintsRef: "" } } } }, "phasePresets.p.intro.timerHintsRef");
  assertRejects(TimerPresets, { phasePresets: { "": { intro: { label: "x" } } } }, "phasePresets.");
});

test("a preset body carries no minutes — durations stay schedule-driven", () => {
  assertRejects(TimerPresets, { phasePresets: { p: { talk: { minutes: 5 } } } }, "phasePresets.p.talk");
});

test("a set holds cues or hints, never refs, and never the reduced cue shape", () => {
  assertRejects(TimerPresets, { cueSets: { talk: { sets: { s: [{ cuesRef: "x" }] } } } }, "cueSets.talk.sets.s.0");
  assertRejects(TimerPresets, { cueSets: { talk: { sets: { s: [{ label: "warn", atDuration: 60 }] } } } }, "cueSets.talk.sets.s.0");
  assertRejects(TimerPresets, { hintSets: { talk: { sets: { s: [{ kind: "remaining", value: 1 }] } } } }, "hintSets.talk.sets.s.0.value");
});

test("the phase keys are closed on every per-phase container", () => {
  assertRejects(TimerPresets, { phasePresets: { p: { discussion: {} } } }, "phasePresets.p.discussion");
  assertRejects(TimerPresets, { cueSets: { none: { sets: {} } } }, "cueSets.none");
  assertRejects(TimerPresets, { hintSets: { break: { sets: {} } } }, "hintSets.break");
});

test("keys, names and defaults are non-empty, and the document is strict", () => {
  assertRejects(TimerPresets, { cueSets: { talk: { sets: {}, default: "" } } }, "cueSets.talk.default");
  assertRejects(TimerPresets, { cueSets: { talk: { sets: { "": [] } } } }, "cueSets.talk.sets.");
  assertRejects(TimerPresets, { phasePresets: { "": {} } }, "phasePresets.");
  assertRejects(TimerPresets, { presets: {} }, "");
  assertRejects(TimerPresets, { cueSets: { talk: { sets: {}, defaults: "x" } } }, "cueSets.talk");
});

test("the document is not a message: no envelope, and an envelope is a typo", () => {
  assertRejects(TimerPresets, { type: "presets", domain: "timer", kind: "document", ts: "2026-09-29T14:00:00Z" }, "");
});

test("the emitted schema stands alone, with one definition and a mirror-usable shape", async () => {
  const schemas = await readSchemas();
  const doc = schemas.get("timer-presets.schema.json");
  assert.ok(doc, "timer-presets.schema.json is emitted");
  const { name, schema } = definitionOf(doc);
  assert.equal(name, "TimerPresets");
  assert.ok(!("type" in schema.properties) && !("domain" in schema.properties), "no envelope");
  assert.deepEqual(Object.keys(schema.properties), ["phasePresets", "cueSets", "hintSets"]);
  assert.equal(schema.required, undefined, "every member is optional");

  // Every record is typed and every object is strict: no open bag anywhere in the document.
  walk(schema, (node, path) => {
    if (node.type !== "object") {
      return;
    }
    if (typeof node.additionalProperties === "object") {
      assert.equal(typeof node.additionalProperties.type, "string", `record at ${path.join("/")} is typed`);
    } else {
      assert.equal(node.additionalProperties, false, `object at ${path.join("/")} is strict`);
    }
  });

  // The titles the mirror names its classes by, at the sites that have no property name.
  const preset = schema.properties.phasePresets.additionalProperties;
  assert.deepEqual(preset.propertyNames.enum, ["intro", "talk", "qa"]);
  assert.equal(preset.additionalProperties.title, "PhaseBody");
  assert.deepEqual(Object.keys(preset.additionalProperties.properties), ["label", "load", "phaseCues", "timerHints", "cuesRef", "timerHintsRef"]);
  const cueSets = schema.properties.cueSets.additionalProperties;
  assert.equal(cueSets.title, "NamedCueSets");
  assert.equal(cueSets.properties.sets.additionalProperties.items.title, "PhaseCue");
  const hintSets = schema.properties.hintSets.additionalProperties;
  assert.equal(hintSets.title, "NamedHintSets");
  assert.equal(hintSets.properties.sets.additionalProperties.items.title, "TimerHint");
});
