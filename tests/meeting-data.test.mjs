// The entity vocabulary's invariants — every `.check()` in src/shared/meeting-data.ts, plus the
// strictness and the honest-empty rules the messages inherit from it (ADR-0033;
// mtngtools/mtng-dotnet-mono#733).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculatedPhase,
  phaseFit,
  presentation,
  presentationCalculatedTiming,
  speaker,
} from "../src/shared/meeting-data.ts";
import {
  assertAccepts,
  assertRejects,
  calculatedPhaseSample,
  later,
  presentationSample,
  speakerSample,
  ts,
} from "./support.mjs";

test("presentation: the full sample validates", () => {
  assertAccepts(presentation, presentationSample());
});

test("presentation: prId and prTitle are the required members, and '' is an honest title", () => {
  assertAccepts(presentation, { prId: "pr-1", prTitle: "" });
  assertRejects(presentation, { prTitle: "no id" }, "prId");
  assertRejects(presentation, { prId: "", prTitle: "empty id" }, "prId");
  assertRejects(presentation, { prId: "pr-1" }, "prTitle");
});

test("presentation: prEnd carries prStart", () => {
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prEnd: later }, "prStart");
  assertAccepts(presentation, { prId: "pr-1", prTitle: "t", prStart: ts });
  assertAccepts(presentation, { prId: "pr-1", prTitle: "t", prStart: ts, prEnd: later });
});

test("presentation: datetimes are ISO-8601 UTC with a Z, never unix milliseconds", () => {
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prStart: 1790000000000 }, "prStart");
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prStart: "2026-09-29T14:00:00+02:00" }, "prStart");
});

test("presentation: arrays are three-state — absent, [], populated", () => {
  const base = { prId: "pr-1", prTitle: "t" };
  assertAccepts(presentation, base);
  assertAccepts(presentation, { ...base, prSpeakers: [] });
  assertAccepts(presentation, { ...base, prSpeakers: [speakerSample()] });
  assertAccepts(presentation, { ...base, prTags: [], prSecondaryTags: ["x"] });
});

test("presentation: prModerators and prModeratorIds are one-of", () => {
  const base = { prId: "pr-1", prTitle: "t" };
  assertAccepts(presentation, { ...base, prModerators: [speakerSample()] });
  assertAccepts(presentation, { ...base, prModerators: [] });
  assertAccepts(presentation, { ...base, prModeratorIds: ["sp-1"] });
  assertAccepts(presentation, { ...base, prModeratorIds: [] });
  assertRejects(presentation, { ...base, prModerators: [], prModeratorIds: [] }, "prModeratorIds");
  assertRejects(presentation, { ...base, prModeratorIds: [""] }, "prModeratorIds.0");
});

test("presentation: prMetadata is a named bag — optional, {} allowed, any value shape", () => {
  const base = { prId: "pr-1", prTitle: "t" };
  assertAccepts(presentation, { ...base, prMetadata: {} });
  assertAccepts(presentation, { ...base, prMetadata: { nested: { deep: [1, "two", null] }, flag: true } });
  assertRejects(presentation, { ...base, prMetadata: "not a bag" }, "prMetadata");
  assertRejects(presentation, { ...base, prMetadata: null }, "prMetadata");
});

test("presentation: the carrying object stays strict — a misspelt field is a typo, not host data", () => {
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prTitel: "typo" }, "");
});

test("presentation: raw prPhases never rides", () => {
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prPhases: { talk: { minutes: 20 } } }, "");
});

test("presentation: prPhasesPreset is a non-empty key", () => {
  assertAccepts(presentation, { prId: "pr-1", prTitle: "t", prPhasesPreset: "standard" });
  assertRejects(presentation, { prId: "pr-1", prTitle: "t", prPhasesPreset: "" }, "prPhasesPreset");
});

test("speaker: spId and spFullName required, '' allowed on the name only", () => {
  assertAccepts(speaker, { spId: "sp-1", spFullName: "" });
  assertRejects(speaker, { spId: "", spFullName: "x" }, "spId");
  assertRejects(speaker, { spId: "sp-1" }, "spFullName");
});

test("speaker: spOrder and spOrderKey are one-of", () => {
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x", spOrder: 2 });
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x", spOrderKey: "1a" });
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x" });
  assertRejects(speaker, { spId: "sp-1", spFullName: "x", spOrder: 2, spOrderKey: "1a" }, "spOrderKey");
});

test("speaker: spMetadata is a named bag and the object stays strict", () => {
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x", spMetadata: {} });
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x", spMetadata: { pronouns: "she/her" } });
  assertRejects(speaker, { spId: "sp-1", spFullName: "x", spNickname: "typo" }, "");
});

test("speaker: the optional strings are lenient, as upstream is", () => {
  assertAccepts(speaker, { spId: "sp-1", spFullName: "x", spEmail: "not an address", spPicURL: "nor a url" });
});

test("calculated entry: minutes and source required; end carries start", () => {
  assertAccepts(calculatedPhase, { minutes: 0, source: "no-time" });
  assertRejects(calculatedPhase, { source: "concrete" }, "minutes");
  assertRejects(calculatedPhase, { minutes: 5 }, "source");
  assertRejects(calculatedPhase, { minutes: -1, source: "concrete" }, "minutes");
  assertRejects(calculatedPhase, { minutes: 5, source: "concrete", end: later }, "start");
  assertAccepts(calculatedPhase, { minutes: 5, source: "concrete", start: ts });
  assertAccepts(calculatedPhase, calculatedPhaseSample());
});

test("calculated entry: source is upstream's closed five-value enum", () => {
  for (const source of ["concrete", "fill", "no-time", "normalized-fill", "normalized-no-time"]) {
    assertAccepts(calculatedPhase, { minutes: 1, source });
  }
  assertRejects(calculatedPhase, { minutes: 1, source: "guessed" }, "source");
});

test("calculated entry: refs are legal, alone or beside the inline array", () => {
  assertAccepts(calculatedPhase, { minutes: 1, source: "concrete", cuesRef: "standard", timerHintsRef: "qa-strict" });
  assertAccepts(calculatedPhase, { minutes: 1, source: "concrete", cuesRef: "standard", phaseCues: [{ label: "warn", at: 1 }] });
  assertRejects(calculatedPhase, { minutes: 1, source: "concrete", cuesRef: "" }, "cuesRef");
  assertRejects(calculatedPhase, { minutes: 1, source: "concrete", label: "" }, "label");
});

test("calculated entry: a floor or cap hint carries value, every other kind carries none", () => {
  const entry = (timerHints) => ({ minutes: 1, source: "concrete", timerHints });
  assertRejects(calculatedPhase, entry([{ kind: "floor" }]), "timerHints.0.value");
  assertRejects(calculatedPhase, entry([{ kind: "cap", unit: "percent" }]), "timerHints.0.value");
  assertRejects(calculatedPhase, entry([{ kind: "remaining", value: 1 }]), "timerHints.0.value");
  assertRejects(calculatedPhase, entry([{ kind: "protectQA", value: 0 }]), "timerHints.0.value");
  assertAccepts(calculatedPhase, entry([{ kind: "protectQA" }, { kind: "cap", value: 90, unit: "percent" }, { kind: "remaining", whenPrLateBy: 5 }]));
});

test("calculated entry: strictness survives the extend — the reduced 'cues' spelling is rejected", () => {
  assertRejects(calculatedPhase, { minutes: 1, source: "concrete", cues: [{ label: "warn", atDuration: 60 }] }, "");
});

test("calculated timing: phases are intro / talk / qa and nothing else", () => {
  const timing = (phases) => ({ phases, fit: { fit: "exact" }, resolverNotes: [] });
  assertAccepts(presentationCalculatedTiming, timing({}));
  assertAccepts(presentationCalculatedTiming, timing({ intro: { minutes: 2, source: "concrete" }, qa: { minutes: 5, source: "fill" } }));
  assertRejects(presentationCalculatedTiming, timing({ discussion: { minutes: 2, source: "concrete" } }), "phases.discussion");
  assertRejects(presentationCalculatedTiming, { phases: {}, fit: { fit: "exact" } }, "resolverNotes");
});

test("fit: a tagged record — slackMin rides 'slack', overMin rides 'overflow', neither rides 'exact'", () => {
  assertAccepts(phaseFit, { fit: "exact" });
  assertAccepts(phaseFit, { fit: "slack", slackMin: 3 });
  assertAccepts(phaseFit, { fit: "overflow", overMin: 2 });
  assertRejects(phaseFit, { fit: "slack" }, "slackMin");
  assertRejects(phaseFit, { fit: "overflow" }, "overMin");
  assertRejects(phaseFit, { fit: "exact", slackMin: 1 }, "slackMin");
  assertRejects(phaseFit, { fit: "slack", slackMin: 1, overMin: 1 }, "overMin");
});

test("the parsed output keeps upstream's spellings", () => {
  const parsed = assertAccepts(presentation, presentationSample());
  assert.deepEqual(Object.keys(parsed).sort(), [
    "prEnd",
    "prId",
    "prMetadata",
    "prPhasesCalculated",
    "prPhasesPreset",
    "prSpeakers",
    "prStart",
    "prTitle",
  ]);
  assert.deepEqual(Object.keys(parsed.prPhasesCalculated.phases.talk).sort(), [
    "end",
    "label",
    "load",
    "minutes",
    "phaseCues",
    "source",
    "start",
    "timerHints",
  ]);
});
