// The room-computers set — room-computers.state-changed and room-computers.current-state — and
// the group rules R1–R7 (mtngtools/mtng-dotnet-mono#994; RoomComputersManager wire-messages.md).
// R2 and R3 are the .check()'s; the rest are what it must let through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RoomComputersCurrentState } from "../src/messages/room-computers/rpc.ts";
import { RoomComputersStateChanged } from "../src/messages/room-computers/events.ts";
import { assertAccepts, assertRejects, definitionOf, readSchemas, root, ts } from "./support.mjs";

/** The spec's example document. */
const stateSample = (overrides = {}) => ({
  type: "state-changed",
  domain: "room-computers",
  kind: "event",
  ts,
  computers: {
    "primary-controller": { machineName: "room-a12-ctrl" },
    "content-1": { machineName: "room-a12-content1" },
    "content-2": { machineName: "stage-pc" },
  },
  groups: {
    controllers: ["primary-controller"],
    content: ["content-1", "content-2"],
  },
  ...overrides,
});

const withComputers = (computers, groups = {}) => stateSample({ computers, groups });

test("state-changed: the spec's example document validates", () => {
  assertAccepts(RoomComputersStateChanged, stateSample());
});

test("state-changed: the body carries computers and groups and nothing else", () => {
  assertRejects(RoomComputersStateChanged, stateSample({ target: "room-a12" }));
  assertRejects(RoomComputersStateChanged, stateSample({ room: "a12" }));
});

test("state-changed: computers is required and never empty", () => {
  const { computers, ...withoutComputers } = stateSample();
  assertRejects(RoomComputersStateChanged, withoutComputers, "computers");
  assertRejects(RoomComputersStateChanged, withComputers({}), "computers");
});

test("state-changed: groups is required, and may be an empty map", () => {
  const { groups, ...withoutGroups } = stateSample();
  assertRejects(RoomComputersStateChanged, withoutGroups, "groups");
  assertAccepts(RoomComputersStateChanged, stateSample({ groups: {} }));
});

test("state-changed: virtual names and group names match ^[a-z0-9-]+$, with no length limit", () => {
  const long = "a".repeat(300);
  assertAccepts(RoomComputersStateChanged, withComputers({ [long]: { machineName: "pc" } }, { [long]: [long] }));

  for (const refused of ["Lectern", "lectern_1", "lectern 1", "lectern.1", ""]) {
    assertRejects(RoomComputersStateChanged, withComputers({ [refused]: { machineName: "pc" } }), undefined, `virtual name '${refused}'`);
    assertRejects(
      RoomComputersStateChanged,
      withComputers({ lectern: { machineName: "pc" } }, { [refused]: ["lectern"] }),
      undefined,
      `group name '${refused}'`,
    );
  }
});

test("state-changed: machineName is any non-empty string, never parsed", () => {
  for (const kept of ["ROOM-A12-CTRL", " padded ", "stage pc", "pc.example.org", "ünïcode"]) {
    assertAccepts(RoomComputersStateChanged, withComputers({ lectern: { machineName: kept } }), `machineName '${kept}'`);
  }

  assertRejects(RoomComputersStateChanged, withComputers({ lectern: { machineName: "" } }), "computers.lectern.machineName");
});

test("state-changed: a computer entry is an object carrying machineName and nothing else", () => {
  assertRejects(RoomComputersStateChanged, withComputers({ lectern: "room-a12-lectern" }), "computers.lectern");
  assertRejects(RoomComputersStateChanged, withComputers({ lectern: {} }), "computers.lectern.machineName");
  assertRejects(RoomComputersStateChanged, withComputers({ lectern: { machineName: "pc", os: "windows" } }), "computers.lectern");
});

test("R1: a virtual name in several groups is allowed", () => {
  assertAccepts(
    RoomComputersStateChanged,
    withComputers({ lectern: { machineName: "pc" } }, { stage: ["lectern"], speakers: ["lectern"] }),
  );
});

test("R2: a group member that is not a key in computers is refused", () => {
  assertRejects(
    RoomComputersStateChanged,
    withComputers({ lectern: { machineName: "pc" } }, { stage: ["lectern", "confidence-monitor"] }),
    "groups.stage.1",
  );
});

test("R3: a duplicate within one group is refused", () => {
  assertRejects(
    RoomComputersStateChanged,
    withComputers({ lectern: { machineName: "pc" } }, { stage: ["lectern", "lectern"] }),
    "groups.stage.1",
  );
});

test("R4: an empty group is allowed", () => {
  assertAccepts(RoomComputersStateChanged, withComputers({ lectern: { machineName: "pc" } }, { stage: [] }));
});

test("R5: a group name equal to a virtual name is allowed — separate namespaces", () => {
  assertAccepts(RoomComputersStateChanged, withComputers({ lectern: { machineName: "pc" } }, { lectern: ["lectern"] }));
});

test("R6: two virtual names sharing one machineName are allowed", () => {
  assertAccepts(
    RoomComputersStateChanged,
    withComputers({ "primary-controller": { machineName: "room-a12-ctrl" }, lectern: { machineName: "room-a12-ctrl" } }),
  );
});

test("R7: a virtual name in no group is allowed", () => {
  assertAccepts(
    RoomComputersStateChanged,
    withComputers({ lectern: { machineName: "pc" }, spare: { machineName: "spare-pc" } }, { stage: ["lectern"] }),
  );
});

test("current-state: envelope-only, with no target", () => {
  const request = { type: "current-state", domain: "room-computers", kind: "rpc", ts };
  assertAccepts(RoomComputersCurrentState, request);
  assertRejects(RoomComputersCurrentState, { ...request, target: "room-a12" });
  assertRejects(RoomComputersCurrentState, { ...request, kind: "event" }, "kind");
});

test("the emitted entry is a typed record value titled Computer, and the members are closed", async () => {
  const schemas = await readSchemas();
  const { schema } = definitionOf(schemas.get("room-computers-state-changed.schema.json"));
  assert.deepEqual(Object.keys(schema.properties), ["type", "domain", "kind", "ts", "computers", "groups"]);
  assert.deepEqual(schema.required, ["type", "domain", "kind", "ts", "computers", "groups"]);

  const entry = schema.properties.computers.additionalProperties;
  assert.equal(entry.title, "Computer");
  assert.equal(entry.additionalProperties, false);
  assert.deepEqual(entry.required, ["machineName"]);
  assert.equal(schema.properties.computers.propertyNames.pattern, "^[a-z0-9-]+$");
  assert.equal(schema.properties.groups.propertyNames.pattern, "^[a-z0-9-]+$");
  assert.equal(schema.properties.groups.additionalProperties.type, "array");

  const { schema: request } = definitionOf(schemas.get("room-computers-current-state.schema.json"));
  assert.deepEqual(Object.keys(request.properties), ["type", "domain", "kind", "ts"]);
});

test("both messages stay off the TypeScript barrel", async () => {
  const barrel = await readFile(new URL("src/index.ts", root), "utf8");
  assert.ok(!barrel.includes("RoomComputers"), "src/index.ts names no room-computers message");
  assert.ok(!barrel.includes("room-computers"), "src/index.ts imports nothing from room-computers/");
});
