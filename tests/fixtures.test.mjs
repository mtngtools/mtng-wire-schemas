// fixtures/meeting-data/ — the wire → reliable PresentationFull fill, as a contract both
// consumers run (ADR-0012's transport; ADR-0033; mtngtools/mtng-dotnet-mono#734). This side
// validates each case's wire half against the presentation group's schema, asserts the reject
// case is rejected, and holds the expected halves to the fill rule's shape. The fill itself is
// each consumer's to implement; this suite never runs one.
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

const at = (value, path) => path.split(".").reduce((node, key) => node?.[key], value);
const isFillValue = (value) => value === 0 || (Array.isArray(value) && value.length === 0);

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

test("expected: the reliable view's required members are always set, in wire spellings", () => {
  for (const c of filledCases) {
    const e = c.expected;
    assert.equal(e.prId, c.wire.prId, `${c.file}: prId passes through`);
    assert.equal(e.prTitle, c.wire.prTitle, `${c.file}: prTitle passes through, '' included`);
    assert.equal(typeof e.prStart, "number", `${c.file}: prStart is unix milliseconds`);
    assert.equal(typeof e.prEnd, "number", `${c.file}: prEnd is unix milliseconds`);
    assert.ok(Array.isArray(e.prSpeakers), `${c.file}: prSpeakers is always an array`);
    assert.ok(Array.isArray(e.filled), `${c.file}: filled is an array`);
    assert.ok(!("prModeratorIds" in e), `${c.file}: prModeratorIds is folded into prModerators`);
    for (const sp of [...e.prSpeakers, ...(e.prModerators ?? [])].filter((m) => typeof m === "object")) {
      assert.ok(!("spOrderKey" in sp), `${c.file}: spOrderKey is folded into spOrder`);
    }
  }
});

test("expected: filled names exactly the members the wire left absent, each at the type's honest empty", () => {
  for (const c of filledCases) {
    const e = c.expected;
    assert.deepEqual(e.filled, [...new Set(e.filled)].sort(), `${c.file}: filled is sorted and unique`);
    for (const path of e.filled) {
      assert.equal(at(c.wire, path), undefined, `${c.file}: '${path}' is absent on the wire`);
      assert.ok(isFillValue(at(e, path)), `${c.file}: '${path}' is filled with 0 or []`);
    }

    const expectFilled = (path, present) => {
      assert.equal(e.filled.includes(path), !present, `${c.file}: '${path}' ${present ? "is not" : "is"} in filled`);
    };
    expectFilled("prStart", c.wire.prStart !== undefined);
    expectFilled("prEnd", c.wire.prEnd !== undefined);
    expectFilled("prSpeakers", c.wire.prSpeakers !== undefined);
    for (const [phase, entry] of Object.entries(c.wire.prPhasesCalculated?.phases ?? {})) {
      expectFilled(`prPhasesCalculated.phases.${phase}.start`, entry.start !== undefined);
      expectFilled(`prPhasesCalculated.phases.${phase}.end`, entry.end !== undefined);
    }
  }
});

test("expected: a present datetime is the wire's instant in unix milliseconds", () => {
  for (const c of filledCases) {
    const e = c.expected;
    for (const key of ["prStart", "prEnd"]) {
      if (c.wire[key] !== undefined) {
        assert.equal(e[key], Date.parse(c.wire[key]), `${c.file}: ${key}`);
      }
    }
    for (const [phase, entry] of Object.entries(c.wire.prPhasesCalculated?.phases ?? {})) {
      for (const key of ["start", "end"]) {
        if (entry[key] !== undefined) {
          assert.equal(e.prPhasesCalculated.phases[phase][key], Date.parse(entry[key]), `${c.file}: ${phase}.${key}`);
        }
      }
    }
  }
});

test("expected: the fold rules for moderators and speaker order", () => {
  for (const c of filledCases) {
    const e = c.expected;
    if (c.wire.prModerators !== undefined) {
      assert.deepEqual(e.prModerators, c.wire.prModerators, `${c.file}: moderator objects pass through`);
    } else if (c.wire.prModeratorIds !== undefined) {
      const byId = new Map((c.wire.prSpeakers ?? []).map((sp) => [sp.spId, sp]));
      assert.deepEqual(
        e.prModerators,
        c.wire.prModeratorIds.map((id) => byId.get(id) ?? id),
        `${c.file}: an id matching a prSpeakers entry resolves to it, any other passes as an id`,
      );
    } else {
      assert.ok(!("prModerators" in e), `${c.file}: neither form → no prModerators`);
    }

    (c.wire.prSpeakers ?? []).forEach((sp, i) => {
      const folded = sp.spOrder ?? sp.spOrderKey;
      assert.equal(e.prSpeakers[i].spOrder, folded, `${c.file}: speaker ${i} spOrder is the one set, or absent`);
    });
  }
});

test("expected: the bags and the tags pass through untouched, absent staying absent", () => {
  for (const c of filledCases) {
    const e = c.expected;
    for (const key of ["prMetadata", "prTags", "prSecondaryTags", "prPhasesPreset"]) {
      assert.deepEqual(e[key], c.wire[key], `${c.file}: ${key}`);
    }
    (c.wire.prSpeakers ?? []).forEach((sp, i) => {
      assert.deepEqual(e.prSpeakers[i].spMetadata, sp.spMetadata, `${c.file}: speaker ${i} spMetadata`);
    });
  }
});
