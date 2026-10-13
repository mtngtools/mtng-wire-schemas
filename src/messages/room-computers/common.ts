import { z } from "zod";

/**
 * Shared building blocks for the `room-computers` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces both room-computers messages are assembled from.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, a
 * titled shape wherever a `z.record()` reaches one) are in the repo README, with the generator
 * output that settles each one.
 */

/**
 * The envelope both room-computers messages carry: `{type, domain, kind, ts}`.
 *
 * **No `<target>` segment on either.** The room's computers are room-singular, so a key stops
 * at the name: `room-computers.state-changed`, `room-computers.current-state`. The domain is
 * scoped to session rooms and names no particular room, so the room never enters the key.
 *
 * Spread into a message, so the envelope fields lead and the body follows:
 * `z.strictObject({ ...roomComputersEnvelope("state-changed", "event"), ...body })`.
 */
export const roomComputersEnvelope = <TType extends string, TKind extends "event" | "rpc">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["room-computers"])
    .describe(
      "The owning domain — <domain> in the routing key. Scoped to session rooms, and " +
        "room-singular, so the key stops here: there is no <target> segment on any " +
        "room-computers message.",
    ),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe(
      "The PUBLISH instant — when this message went out, ISO-8601 UTC. There is no separate " +
        "equality stamp: the document is the state, so two publishes compare by content.",
    ),
});

/**
 * A virtual name or a group name: `^[a-z0-9-]+$`, no length limit.
 *
 * `windowId`'s rule, so either kind of name can become a routing `<target>`. Lowercase only, so
 * comparing two names raises no case question.
 */
export const roomComputersName = (what: string) =>
  z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .describe(`${what}: lowercase letters, digits and hyphens (^[a-z0-9-]+$), no length limit.`);

/**
 * One computer: the value a virtual name maps to.
 *
 * **An object, not a bare string,** so a per-computer member (an address for network reach, the
 * OS) can be added later as an optional field without breaking anyone.
 *
 * **Titled `Computer`** because it is the value of a `z.record()`, where there is no property name
 * for the mirror to name the C# class after; it mirrors as `RoomComputersStateChangedComputer`.
 */
export const roomComputer = z
  .strictObject({
    machineName: z
      .string()
      .min(1)
      .describe(
        "The box's routing label — IRoutingConfiguration.MachineName, the label the backbone " +
          "reaches the box by. Any non-empty string, NEVER PARSED: it is an OS observation " +
          "(Windows shows hostnames upper-case). A reader compares it ordinal, ignoring case, " +
          "and nothing else.",
      ),
  })
  .meta({ title: "Computer" })
  .describe("One computer in the room: the box a virtual name points at.");
