// The switcher set — three documents (state-changed, details-changed, tally-changed), four
// commands (set-preview, set-program, cut, auto) and three requests (current-state,
// current-details, current-tally), every key switcher.<name>.<target>
// (mtngtools/mtng-dotnet-mono#1106; SwitcherManager wire-messages.md). The tally's colour rule is
// the .check()'s; the rest is structure.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SwitcherAuto, SwitcherCut, SwitcherSetPreview, SwitcherSetProgram } from "../src/messages/switcher/commands.ts";
import { SwitcherDetailsChanged, SwitcherStateChanged, SwitcherTallyChanged } from "../src/messages/switcher/events.ts";
import { SwitcherCurrentDetails, SwitcherCurrentState, SwitcherCurrentTally } from "../src/messages/switcher/rpc.ts";
import { assertAccepts, assertRejects, definitionOf, readSchemas, root, ts } from "./support.mjs";

const envelope = (type, kind) => ({ type, domain: "switcher", kind, ts, target: "main" });

/** The spec's basic-state example. */
const stateSample = (overrides = {}) => ({
  ...envelope("state-changed", "event"),
  link: "connected",
  mixEffects: [
    {
      me: 1,
      program: { source: 6000, bundled: [1000, 2001, 2002, 2] },
      preview: { source: 1000, bundled: [] },
      inTransition: false,
    },
    { me: 2, program: { source: 3, bundled: [] }, preview: { source: 2, bundled: [] }, inTransition: false },
  ],
  ...overrides,
});

/** The spec's advanced-state example. */
const detailsSample = (overrides = {}) => ({
  ...envelope("details-changed", "event"),
  model: "ATEM 2 M/E Production Studio 4K",
  sources: [
    { id: 0, shortName: "Blk", longName: "Black" },
    { id: 1, shortName: "CAp1", longName: "1 C11 pick1" },
    { id: 4, shortName: "", longName: "4 C22 Zpgm" },
  ],
  superSources: [
    {
      superSource: 1,
      id: 6000,
      boxes: [
        { box: 1, enabled: true, source: 1000 },
        { box: 2, enabled: true, source: 2001 },
        { box: 3, enabled: true, source: 2002 },
        { box: 4, enabled: true, source: 2 },
      ],
      art: { fill: 0, key: 3011, placement: "background" },
    },
  ],
  ...overrides,
});

/** The spec's tally example. */
const tallySample = (overrides = {}) => ({
  ...envelope("tally-changed", "event"),
  link: "connected",
  computers: {
    "content-1": { tally: "program", color: "#ff0000" },
    "content-2": { tally: "off" },
    lectern: { tally: "preview", color: "#00ff00" },
  },
  ...overrides,
});

const withComputers = (computers) => tallySample({ computers });

test("every message carries the envelope, domain switcher, and a required target", () => {
  const samples = [
    [SwitcherStateChanged, stateSample()],
    [SwitcherDetailsChanged, detailsSample()],
    [SwitcherTallyChanged, tallySample()],
    [SwitcherSetPreview, { ...envelope("set-preview", "command"), me: 1, source: 2001 }],
    [SwitcherSetProgram, { ...envelope("set-program", "command"), me: 1, source: 2001 }],
    [SwitcherCut, { ...envelope("cut", "command"), me: 1 }],
    [SwitcherAuto, { ...envelope("auto", "command"), me: 1 }],
    [SwitcherCurrentState, envelope("current-state", "rpc")],
    [SwitcherCurrentDetails, envelope("current-details", "rpc")],
    [SwitcherCurrentTally, envelope("current-tally", "rpc")],
  ];

  for (const [schema, sample] of samples) {
    assertAccepts(schema, sample, `${sample.type} validates`);
    const { target, ...untargeted } = sample;
    assertRejects(schema, untargeted, "target", `${sample.type} without target`);
    assertRejects(schema, { ...sample, target: "" }, "target", `${sample.type} with an empty target`);
    assertRejects(schema, { ...sample, target: "Studio B" }, "target", `${sample.type} with a target off the routing-segment pattern`);
    assertAccepts(schema, { ...sample, target: "studio-b2" }, `${sample.type} with a lowercase, hyphenated target`);
    assertRejects(schema, { ...sample, domain: "atem" }, "domain", `${sample.type} in another domain`);
    assertRejects(schema, { ...sample, extra: true }, undefined, `${sample.type} with an unknown member`);
  }
});

test("state-changed: the spec's example document validates", () => {
  assertAccepts(SwitcherStateChanged, stateSample());
});

test("state-changed: mixEffects is never empty, and each me is numbered from 1", () => {
  assertRejects(SwitcherStateChanged, stateSample({ mixEffects: [] }), "mixEffects");
  const [first] = stateSample().mixEffects;
  assertRejects(SwitcherStateChanged, stateSample({ mixEffects: [{ ...first, me: 0 }] }), "mixEffects.0.me");
});

test("state-changed: a bus is {source, bundled} and nothing else", () => {
  const [first] = stateSample().mixEffects;
  assertRejects(SwitcherStateChanged, stateSample({ mixEffects: [{ ...first, program: { source: 1 } }] }), "mixEffects.0.program.bundled");
  assertRejects(
    SwitcherStateChanged,
    stateSample({ mixEffects: [{ ...first, program: { source: 1, bundled: [], label: "x" } }] }),
    "mixEffects.0.program",
  );
  assertRejects(SwitcherStateChanged, stateSample({ mixEffects: [{ ...first, position: 0.5 }] }), "mixEffects.0");
});

test("state-changed: link is connected, connecting or dropped", () => {
  for (const link of ["connected", "connecting", "dropped"]) {
    assertAccepts(SwitcherStateChanged, stateSample({ link }), `link '${link}'`);
  }

  assertRejects(SwitcherStateChanged, stateSample({ link: "down" }), "link");
  const { link, ...withoutLink } = stateSample();
  assertRejects(SwitcherStateChanged, withoutLink, "link");
});

test("details-changed: the spec's example document validates, and it carries no link", () => {
  assertAccepts(SwitcherDetailsChanged, detailsSample());
  assertRejects(SwitcherDetailsChanged, detailsSample({ link: "connected" }));
});

test("details-changed: sources are {id, shortName, longName}; superSources carry boxes and art", () => {
  assertRejects(SwitcherDetailsChanged, detailsSample({ sources: [{ id: 0, shortName: "Blk" }] }), "sources.0.longName");
  assertRejects(
    SwitcherDetailsChanged,
    detailsSample({ sources: [{ id: 0, shortName: "Blk", longName: "Black", labelled: true }] }),
    "sources.0",
  );

  const [ss] = detailsSample().superSources;
  assertRejects(SwitcherDetailsChanged, detailsSample({ superSources: [{ ...ss, superSource: 0 }] }), "superSources.0.superSource");
  assertRejects(SwitcherDetailsChanged, detailsSample({ superSources: [{ ...ss, art: { ...ss.art, placement: "middle" } }] }), "superSources.0.art.placement");
  assertAccepts(SwitcherDetailsChanged, detailsSample({ superSources: [{ ...ss, art: { ...ss.art, placement: "foreground" } }] }));
  assertAccepts(SwitcherDetailsChanged, detailsSample({ superSources: [] }));
});

test("tally-changed: the spec's example document validates, and computers may be empty", () => {
  assertAccepts(SwitcherTallyChanged, tallySample());
  assertAccepts(SwitcherTallyChanged, withComputers({}));
  const { link, ...withoutLink } = tallySample();
  assertRejects(SwitcherTallyChanged, withoutLink, "link");
});

test("tally-changed: virtual names match ^[a-z0-9-]+$", () => {
  for (const refused of ["Lectern", "lectern_1", "lectern 1", ""]) {
    assertRejects(SwitcherTallyChanged, withComputers({ [refused]: { tally: "off" } }), undefined, `virtual name '${refused}'`);
  }
});

test("tally-changed: tally is program, preview or off", () => {
  assertRejects(SwitcherTallyChanged, withComputers({ lectern: { tally: "onAir", color: "#ff0000" } }), "computers.lectern.tally");
});

test("tally-changed: color is #rrggbb or #rrggbbaa", () => {
  assertAccepts(SwitcherTallyChanged, withComputers({ lectern: { tally: "program", color: "#ff000080" } }));
  for (const refused of ["ff0000", "#f00", "#ff00000", "red"]) {
    assertRejects(SwitcherTallyChanged, withComputers({ lectern: { tally: "program", color: refused } }), "computers.lectern.color", `color '${refused}'`);
  }
});

test("tally-changed: color is present exactly when lit", () => {
  assertRejects(SwitcherTallyChanged, withComputers({ lectern: { tally: "program" } }), "computers.lectern.color");
  assertRejects(SwitcherTallyChanged, withComputers({ lectern: { tally: "preview" } }), "computers.lectern.color");
  assertRejects(SwitcherTallyChanged, withComputers({ lectern: { tally: "off", color: "#000000" } }), "computers.lectern.color");
});

test("commands: set-preview and set-program carry me and source; cut and auto carry me", () => {
  const preview = { ...envelope("set-preview", "command"), me: 1, source: 2001 };
  assertRejects(SwitcherSetPreview, { ...preview, me: 0 }, "me");
  const { source, ...noSource } = preview;
  assertRejects(SwitcherSetPreview, noSource, "source");
  assertRejects(SwitcherSetProgram, { ...noSource, type: "set-program" }, "source");
  assertRejects(SwitcherCut, { ...envelope("cut", "command"), me: 1, source: 1 });
  assertRejects(SwitcherAuto, { ...envelope("auto", "command") }, "me");
});

test("requests: envelope-only", () => {
  assertRejects(SwitcherCurrentState, { ...envelope("current-state", "rpc"), me: 1 });
  assertRejects(SwitcherCurrentTally, { ...envelope("current-tally", "event") }, "kind");
});

test("the emitted documents carry the spec's members, and the tally entry is titled Computer", async () => {
  const schemas = await readSchemas();
  const head = ["type", "domain", "kind", "ts", "target"];

  const { schema: state } = definitionOf(schemas.get("switcher-state-changed.schema.json"));
  assert.deepEqual(Object.keys(state.properties), [...head, "link", "mixEffects"]);
  assert.equal(state.properties.mixEffects.minItems, 1);

  const { schema: details } = definitionOf(schemas.get("switcher-details-changed.schema.json"));
  assert.deepEqual(Object.keys(details.properties), [...head, "model", "sources", "superSources"]);

  const { schema: tally } = definitionOf(schemas.get("switcher-tally-changed.schema.json"));
  assert.deepEqual(Object.keys(tally.properties), [...head, "link", "computers"]);
  assert.equal(tally.properties.computers.additionalProperties.title, "Computer");
  assert.equal(tally.properties.computers.propertyNames.pattern, "^[a-z0-9-]+$");
  assert.deepEqual(tally.properties.computers.additionalProperties.required, ["tally"]);

  for (const request of ["current-state", "current-details", "current-tally"]) {
    const { schema } = definitionOf(schemas.get(`switcher-${request}.schema.json`));
    assert.deepEqual(Object.keys(schema.properties), head, request);
  }
});

test("all ten stay off the TypeScript barrel", async () => {
  const barrel = await readFile(new URL("src/index.ts", root), "utf8");
  assert.ok(!barrel.includes("Switcher"), "src/index.ts names no switcher message");
  assert.ok(!barrel.includes("switcher/"), "src/index.ts imports nothing from switcher/");
});
