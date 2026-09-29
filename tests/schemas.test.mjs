// The emitted JSON Schema, as the C# mirror will read it: the shapes that do not survive the
// mirror are absent, the named bags are the only open objects, and no message carries two
// differently-shaped objects under one property name (Core.Wire spec §Authoring rules;
// mtngtools/mtng-dotnet-mono#733). Runs after `npm run generate`, over schemas/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { definitionOf, readSchemas, walk } from "./support.mjs";

const schemas = await readSchemas();

/** A schema document is a message when its definition carries the envelope; otherwise a document. */
const isMessage = (schema) => schema.properties?.type !== undefined && schema.properties?.domain !== undefined;

test("every schema wraps exactly one top-level definition", () => {
  for (const [file, doc] of schemas) {
    const { name } = definitionOf(doc);
    assert.equal(doc.$ref, `#/definitions/${name}`, `${file}: $ref points at its one definition`);
  }
});

test("nothing emits oneOf, anyOf or a nullable type — neither survives the mirror", () => {
  for (const [file, doc] of schemas) {
    walk(doc, (node, path) => {
      assert.ok(!("oneOf" in node), `${file}: oneOf at ${path.join("/")}`);
      assert.ok(!("anyOf" in node), `${file}: anyOf at ${path.join("/")}`);
      assert.ok(!(Array.isArray(node.type) && node.type.includes("null")), `${file}: nullable at ${path.join("/")}`);
    });
  }
});

/**
 * Three kinds of object reach the schema. A strict object (`additionalProperties: false`) and a
 * typed record (`additionalProperties` a schema with a `type`, its value visited and held strict
 * in its own right — the window's `slots`, the group's per-phase `phases`) are both closed. An
 * open bag (`additionalProperties: {}`) is the one shape that admits anything, and only the two
 * named bags may be one.
 */
const isOpenBag = (node) =>
  typeof node.additionalProperties === "object" && Object.keys(node.additionalProperties).length === 0;

test("on a message, every object is closed, and the two named bags are the only open ones", () => {
  for (const [file, doc] of schemas) {
    const { schema } = definitionOf(doc);
    if (!isMessage(schema)) {
      continue;
    }

    walk(schema, (node, path) => {
      if (node.type !== "object") {
        return;
      }

      const property = path.at(-2) === "properties" ? path.at(-1) : undefined;
      const isBag = property === "prMetadata" || property === "spMetadata";

      if (isBag) {
        assert.ok(isOpenBag(node), `${file}: ${property} is an open bag`);
      } else if (typeof node.additionalProperties === "object") {
        assert.ok(!isOpenBag(node), `${file}: record at ${path.join("/")} is typed, not an open bag`);
        assert.equal(typeof node.additionalProperties.type, "string", `${file}: record at ${path.join("/")} has a typed value`);
      } else {
        assert.equal(node.additionalProperties, false, `${file}: object at ${path.join("/")} is strict`);
      }
    });
  }
});

test("the per-phase record is closed by the phase keys and carries the titled entry", () => {
  const { schema } = definitionOf(schemas.get("presentation-state-changed.schema.json"));
  const phases = schema.properties.presentation.properties.prPhasesCalculated.properties.phases;
  assert.deepEqual(phases.propertyNames.enum, ["intro", "talk", "qa"]);
  assert.equal(phases.additionalProperties.additionalProperties, false, "the entry itself is strict");
});

/**
 * The mirror names an inline object after the property that holds it (array items take the
 * array's property; a record's value type takes its title), scoped to the message — so two
 * differently-shaped objects under one name in one message emit one C# class and the second
 * shape's members vanish silently. Structural equality here, ignoring documentation.
 */
const shapeOf = (node) => {
  const strip = (value) => {
    if (Array.isArray(value)) {
      return value.map(strip);
    }
    if (value === null || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "description" && key !== "title")
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  };

  return JSON.stringify(strip(node));
};

const mirrorNameOf = (node, path) => {
  if (path.at(-2) === "properties") {
    return path.at(-1);
  }
  if (path.at(-1) === "items" && path.at(-3) === "properties") {
    return path.at(-2);
  }
  if (typeof node.title === "string") {
    return node.title;
  }

  return undefined;
};

test("no schema emits two differently-shaped objects under one mirror name", () => {
  for (const [file, doc] of schemas) {
    const { schema } = definitionOf(doc);
    const seen = new Map();

    walk(schema, (node, path) => {
      if (node.type !== "object" || node.additionalProperties === undefined || node.additionalProperties !== false) {
        return; // records and bags mirror as dictionaries, not classes
      }

      const name = mirrorNameOf(node, path);
      if (name === undefined) {
        return;
      }

      const shape = shapeOf(node);
      const first = seen.get(name);
      if (first === undefined) {
        seen.set(name, { shape, path });
      } else {
        assert.equal(
          shape,
          first.shape,
          `${file}: '${name}' at ${path.join("/")} differs from '${name}' at ${first.path.join("/")}`,
        );
      }
    });
  }
});

test("the timer events carry prId and phase, and no timer, block or presentation member", () => {
  for (const file of ["timer-state-changed.schema.json", "timer-cue-fired.schema.json"]) {
    const { schema } = definitionOf(schemas.get(file));
    const members = Object.keys(schema.properties);
    assert.ok(members.includes("prId"), `${file} carries prId`);
    assert.ok(members.includes("phase"), `${file} carries phase`);
    assert.ok(members.includes("session") && members.includes("files"), `${file} carries session and files`);
    for (const gone of ["timer", "block", "presentation", "presentationId"]) {
      assert.ok(!members.includes(gone), `${file} carries no ${gone}`);
    }
    assert.deepEqual(schema.properties.phase.enum, ["intro", "talk", "qa"]);
    assert.ok(!schema.required.includes("prId") && !schema.required.includes("phase"), `${file}: the key is optional`);
  }
});

test("the presentation carriers spell prId, carry the presentation group, and have lost timer and block", () => {
  for (const [file, requiredPrId] of [
    ["presentation-state-changed.schema.json", false],
    ["presentation-enter.schema.json", true],
  ]) {
    const { schema } = definitionOf(schemas.get(file));
    const members = Object.keys(schema.properties);
    assert.ok(members.includes("prId"), `${file} spells prId`);
    assert.equal(schema.required.includes("prId"), requiredPrId, `${file}: prId required = ${requiredPrId}`);
    assert.ok(members.includes("presentation"), `${file} carries the presentation group`);
    assert.ok(members.includes("session"), `${file} carries session`);
    for (const gone of ["timer", "block", "presentationId"]) {
      assert.ok(!members.includes(gone), `${file} carries no ${gone}`);
    }

    const group = schema.properties.presentation;
    assert.deepEqual(group.required, ["prId", "prTitle"], `${file}: the group requires prId and prTitle only`);
    assert.ok(!("prPhases" in group.properties), `${file}: raw prPhases never rides`);
    const phases = group.properties.prPhasesCalculated.properties.phases;
    assert.deepEqual(phases.propertyNames.enum, ["intro", "talk", "qa"], `${file}: phases is keyed by the three phases`);
    assert.equal(phases.additionalProperties.title, "CalculatedPhase", `${file}: the entry is titled for the mirror`);
    assert.deepEqual(phases.additionalProperties.required, ["minutes", "source"]);
    assert.equal(group.properties.prSpeakers.items.required.length, 2, `${file}: a speaker requires spId and spFullName`);
  }
});

test("the file path spells prSubDirectory", () => {
  const { schema } = definitionOf(schemas.get("presentation-state-changed.schema.json"));
  const path = schema.properties.files.items.properties.path.properties;
  assert.ok("prSubDirectory" in path);
  assert.ok(!("presentationSubDirectory" in path));
});

test("the group's descriptions reach the schema, once, on the shape", () => {
  const { schema } = definitionOf(schemas.get("presentation-state-changed.schema.json"));
  const group = schema.properties.presentation;
  assert.match(group.description, /^The presentation — upstream's PresentationFull/);
  assert.match(group.properties.prMetadata.description, /OPAQUE TO THE ROOM/);
  assert.match(group.properties.prSpeakers.items.description, /^A speaker — upstream's SpeakerBase/);
  const entry = group.properties.prPhasesCalculated.properties.phases.additionalProperties;
  assert.match(entry.description, /^One phase at the Calculated tier/);
  assert.match(entry.properties.phaseCues.items.description, /still symbolic/);
  assert.equal(entry.properties.phaseCues.items.title, "PhaseCue");
});
