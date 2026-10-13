import { z } from "zod";
import { roomComputer, roomComputersEnvelope, roomComputersName } from "./common.ts";

/**
 * Room-computers events — exchange `mtng.events`, routing key `room-computers.<name>`.
 */

/**
 * `room-computers.state-changed` — the room's computers, by virtual name and group.
 *
 * The whole document, published by the room-computers Manager at boot and on every change
 * (mtng-dotnet-mono ADR-0027). `computers` maps each virtual name — the stable name for a box's
 * job in the room — to the box doing it; `groups` names lists of virtual names.
 *
 * **The group rules.** R1 a virtual name in several groups, R4 an empty group, R5 a group name
 * equal to a virtual name, R6 two virtual names sharing one `machineName`, and R7 a virtual name
 * in no group are all allowed. R2 a group member that is not a key in `computers` and R3 a
 * duplicate within one group are refused by the `.check()` below, so this side rejects a
 * malformed document; JSON Schema and C# carry the structure only. A group's order is kept as
 * authored and means nothing.
 */
export const RoomComputersStateChanged = z
  .strictObject({
    ...roomComputersEnvelope("state-changed", "event"),
    computers: z
      .record(roomComputersName("A virtual name"), roomComputer)
      .describe(
        "Virtual name → the computer doing that job. Required and NEVER EMPTY: the Manager " +
          "always publishes its own entry, primary-controller, though the wire does not " +
          "require that key.",
      ),
    groups: z
      .record(
        roomComputersName("A group name"),
        z
          .array(roomComputersName("A member — a virtual name, a key in computers"))
          .describe(
            "The group's members. Each is a key in computers and appears once; the order is " +
              "kept as authored and means nothing — a console may show it, never act on it.",
          ),
      )
      .describe(
        "Group name → the virtual names in it. Required; may be an empty map, and a group may " +
          "be empty. Group names and virtual names are separate namespaces.",
      ),
  })
  .check((ctx) => {
    const { computers, groups } = ctx.value;

    if (Object.keys(computers).length === 0) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["computers"],
        message: "computers is never empty — the Manager always publishes its own entry",
      });
    }

    for (const [group, members] of Object.entries(groups)) {
      const seen = new Set<string>();
      members.forEach((member, index) => {
        if (!Object.hasOwn(computers, member)) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: ["groups", group, index],
            message: `'${member}' is not a key in computers — every group member is a published computer`,
          });
        }

        if (seen.has(member)) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: ["groups", group, index],
            message: `'${member}' appears more than once in group '${group}' — one entry per member`,
          });
        }

        seen.add(member);
      });
    }
  })
  .describe(
    "The room's computers, by virtual name and group — the whole document, published at boot " +
      "and on every change. computers is never empty; every group member is a key in computers " +
      "and appears once per group. Names match ^[a-z0-9-]+$; machineName is never parsed.",
  );

export type RoomComputersStateChanged = z.infer<typeof RoomComputersStateChanged>;
