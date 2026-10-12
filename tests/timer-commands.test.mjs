// set-to's optional cues: the same shared cue shape set-cues carries, absent meaning the held cues
// stay (mtngtools/mtng-dotnet-mono#922).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TimerSetCues, TimerSetTo } from "../src/messages/timer/commands.ts";
import { assertAccepts, assertRejects, definitionOf, readSchemas, ts } from "./support.mjs";

const setToSample = (overrides = {}) => ({
  type: "set-to",
  domain: "timer",
  kind: "command",
  ts,
  target: "presentation-phase",
  value: 300,
  running: true,
  ...overrides,
});

test("set-to: cues is optional — absent, empty and populated all validate", () => {
  assertAccepts(TimerSetTo, setToSample());
  assertAccepts(TimerSetTo, setToSample({ cues: [] }));
  assertAccepts(TimerSetTo, setToSample({ cues: [{ label: "warn", atDuration: 60 }, { label: "over", atDuration: -30 }] }));
});

test("set-to: cues takes the shared cue shape, and nothing looser", () => {
  assertRejects(TimerSetTo, setToSample({ cues: [{ label: "", atDuration: 60 }] }), "cues.0.label");
  assertRejects(TimerSetTo, setToSample({ cues: [{ label: "warn", atDuration: 1.5 }] }), "cues.0.atDuration");
  assertRejects(TimerSetTo, setToSample({ cues: [{ label: "warn" }] }), "cues.0.atDuration");
  assertRejects(TimerSetTo, setToSample({ cues: [{ label: "warn", atDuration: 60, at: 1 }] }), "cues.0");
});

test("set-to: still carries no label", () => {
  assertRejects(TimerSetTo, setToSample({ label: "Talk" }), "");
});

test("set-to's emitted cues: not required, and the same item schema set-cues emits", async () => {
  const schemas = await readSchemas();
  const setTo = definitionOf(schemas.get("timer-set-to.schema.json")).schema;
  const setCues = definitionOf(schemas.get("timer-set-cues.schema.json")).schema;
  assert.ok(!setTo.required.includes("cues"), "cues must stay optional on set-to");
  assert.deepEqual(setTo.required, ["type", "domain", "kind", "ts", "target", "value", "running"]);
  assert.deepEqual(setTo.properties.cues.items, setCues.properties.cues.items);
});
