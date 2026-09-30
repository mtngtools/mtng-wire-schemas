// fixtures/meeting-data/ — the wire → reliable PresentationFull fill, as a contract both
// consumers run (ADR-0012's transport; ADR-0033; mtngtools/mtng-dotnet-mono#734). This side
// validates each case's wire half against the presentation group's schema, asserts the reject
// case is rejected, and holds every expected half to one reading of the fill rule with the
// reference fill below. That fill is not a consumer and its reading is not the contract — the
// files are; it exists so that a typo in one of the twenty-one expected halves fails here,
// rather than shipping as the contract and failing both consumers' suites at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { presentation } from "../src/shared/meeting-data.ts";
import { issuesOf, root } from "./support.mjs";

const dir = new URL("fixtures/meeting-data/", root);
const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
const cases = await Promise.all(
  files.map(async (file) => ({ file, ...JSON.parse(await readFile(new URL(file, dir), "utf8")) })),
);

/**
 * The fill rule, as Core.MeetingData README §The reliable view and the fill rule states it:
 * absent `prStart`/`prEnd` and calculated `start`/`end` become `0` and are named in `filled`;
 * absent `prSpeakers` becomes `[]` and is named; `prModerators` + `prModeratorIds` fold into one
 * `prModerators` (objects pass through, an id matching a `prSpeakers` entry resolves to it, any
 * other passes as an id); `spOrder`/`spOrderKey` fold into one `spOrder`; present datetimes are
 * the wire's instant in unix milliseconds; everything else passes through, absent staying absent.
 */
const referenceFill = (wire) => {
  const filled = [];
  const instant = (iso) => Date.parse(iso);
  const foldSpeaker = ({ spOrderKey, ...speaker }) =>
    spOrderKey === undefined ? speaker : { ...speaker, spOrder: spOrderKey };

  const { prModeratorIds, prPhasesCalculated, ...rest } = wire;
  const out = { ...rest };

  for (const key of ["prStart", "prEnd"]) {
    if (wire[key] === undefined) {
      out[key] = 0;
      filled.push(key);
    } else {
      out[key] = instant(wire[key]);
    }
  }

  if (wire.prSpeakers === undefined) {
    out.prSpeakers = [];
    filled.push("prSpeakers");
  } else {
    out.prSpeakers = wire.prSpeakers.map(foldSpeaker);
  }

  if (wire.prModerators !== undefined) {
    out.prModerators = wire.prModerators.map(foldSpeaker);
  } else if (prModeratorIds !== undefined) {
    const byId = new Map(out.prSpeakers.map((speaker) => [speaker.spId, speaker]));
    out.prModerators = prModeratorIds.map((id) => byId.get(id) ?? id);
  }

  if (prPhasesCalculated !== undefined) {
    const phases = {};
    for (const [phase, entry] of Object.entries(prPhasesCalculated.phases)) {
      const filledEntry = { ...entry };
      for (const key of ["start", "end"]) {
        if (entry[key] === undefined) {
          filledEntry[key] = 0;
          filled.push(`prPhasesCalculated.phases.${phase}.${key}`);
        } else {
          filledEntry[key] = instant(entry[key]);
        }
      }
      phases[phase] = filledEntry;
    }
    out.prPhasesCalculated = { ...prPhasesCalculated, phases };
  }

  out.filled = filled.sort();

  return out;
};

test("the set covers every case the fill rule names", () => {
  const names = new Set(cases.map((c) => c.name));
  for (const required of [
    "window-present",
    "window-absent",
    "title-empty",
    "speakers-absent",
    "speakers-empty",
    "speakers-populated",
    "moderators-objects",
    "moderators-ids-resolved",
    "moderators-neither",
    "speaker-order-number",
    "speaker-order-key",
    "speaker-order-neither",
    "calculated-window-absent",
    "bags-present",
    "bags-absent",
    "group-absent",
    "prend-without-prstart",
  ]) {
    assert.ok(names.has(required), `fixtures/meeting-data/${required}.json exists`);
  }
});

test("every case is { name, wire, expected }, named for its file", () => {
  for (const c of cases) {
    assert.deepEqual(Object.keys(c).sort(), ["expected", "file", "name", "wire"], `${c.file}: exactly the three keys`);
    assert.equal(`${c.name}.json`, c.file, `${c.file}: name matches the file`);
  }
});

test("every wire half validates against the presentation group, and the reject case is rejected", () => {
  for (const c of cases) {
    if (c.wire === null) {
      assert.equal(c.expected, null, `${c.file}: the group absent expects nothing`);
      continue;
    }

    const result = presentation.safeParse(c.wire);
    if (c.expected?.rejected === true) {
      assert.ok(!result.success, `${c.file}: the wire must reject this case`);
      assert.deepEqual(Object.keys(c.expected), ["rejected"], `${c.file}: a rejected case expects nothing else`);
    } else {
      assert.ok(result.success, `${c.file}: wire half must validate\n${issuesOf(result).join("\n")}`);
    }
  }
});

test("the group absent and the reject case each appear exactly once", () => {
  assert.equal(cases.filter((c) => c.wire === null).length, 1);
  assert.equal(cases.filter((c) => c.expected?.rejected === true).length, 1);
});

const filledCases = cases.filter((c) => c.wire !== null && c.expected?.rejected !== true);

test("every expected half is exactly what the fill rule produces from its wire half", () => {
  for (const c of filledCases) {
    assert.deepEqual(c.expected, referenceFill(c.wire), `${c.file}: expected differs from the fill rule's reading of wire`);
  }
});

test("expected: the reliable view's required members are always set, in wire spellings", () => {
  for (const c of filledCases) {
    const e = c.expected;
    assert.equal(typeof e.prId, "string", `${c.file}: prId`);
    assert.equal(typeof e.prTitle, "string", `${c.file}: prTitle, '' included`);
    assert.equal(typeof e.prStart, "number", `${c.file}: prStart is unix milliseconds`);
    assert.equal(typeof e.prEnd, "number", `${c.file}: prEnd is unix milliseconds`);
    assert.ok(Array.isArray(e.prSpeakers), `${c.file}: prSpeakers is always an array`);
    assert.ok(!("prModeratorIds" in e), `${c.file}: prModeratorIds is folded into prModerators`);
    for (const speaker of [...e.prSpeakers, ...(e.prModerators ?? [])].filter((m) => typeof m === "object")) {
      assert.ok(!("spOrderKey" in speaker), `${c.file}: spOrderKey is folded into spOrder`);
    }
  }
});

test("expected: filled is sorted, unique, and names only members at the type's honest empty", () => {
  const at = (value, path) => path.split(".").reduce((node, key) => node?.[key], value);
  for (const c of filledCases) {
    const e = c.expected;
    assert.deepEqual(e.filled, [...new Set(e.filled)].sort(), `${c.file}: filled is sorted and unique`);
    for (const path of e.filled) {
      assert.equal(at(c.wire, path), undefined, `${c.file}: '${path}' is absent on the wire`);
      const value = at(e, path);
      assert.ok(value === 0 || (Array.isArray(value) && value.length === 0), `${c.file}: '${path}' is filled with 0 or []`);
    }
  }
});

test("the reference fill itself catches a drifted expected half", () => {
  const c = filledCases.find((x) => x.name === "moderators-ids-resolved");
  const drifted = structuredClone(c.expected);
  drifted.prModerators[0].spFullName += "!";
  assert.notDeepEqual(drifted, referenceFill(c.wire));
  const ghost = structuredClone(c.expected);
  ghost.prSpeakers.push({ spId: "sp-ghost", spFullName: "Ghost" });
  assert.notDeepEqual(ghost, referenceFill(c.wire));
});
