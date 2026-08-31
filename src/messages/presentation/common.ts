import { z } from "zod";

/**
 * Shared building blocks for the `presentation` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces every presentation message is assembled from.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, no
 * `z.discriminatedUnion`, no `.nullable()`) are in the repo README, with the generator output
 * that settles each one.
 */

/**
 * The envelope every presentation message carries: `{type, domain, kind, ts}`.
 *
 * **No `<target>` segment on any of them.** Presentation state is room-singular, so a key stops
 * at the name: `presentation.state-changed`, `presentation.current-state`, `presentation.enter`,
 * `presentation.goto-next-slide`, and so on. The timer's target exists because a timer is a keyed
 * instance; here a target would have one forever-value. **The commands keep the rule for a second
 * reason** — they address the Manager and actuation stops there
 * (mtngtools/mtng-dotnet-mono#375), so the instance a navigation reaches rides the body as an
 * opaque `instanceId` rather than the key.
 *
 * Spread into a message, so the envelope fields lead and the body follows:
 * `z.strictObject({ ...presentationEnvelope("state-changed", "event"), ...body })`.
 */
export const presentationEnvelope = <
  TType extends string,
  TKind extends "event" | "command" | "rpc",
>(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["presentation"])
    .describe(
      "The owning domain — <domain> in the routing key. Room-singular, so the key stops here: " +
        "there is no <target> segment on any presentation message. The commands address the " +
        "Manager and actuation stops there, so the instance a navigation reaches rides the body " +
        "as an opaque instanceId rather than the key.",
    ),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe(
      "The PUBLISH instant — when this message went out, ISO-8601 UTC. Not the transition " +
        "instant: a boot re-broadcast of an unchanged state refreshes ts and leaves enteredAt " +
        "untouched. Which of the two a consumer's freshness logic reads is that consumer's " +
        "decision, not this contract's.",
    ),
});

/**
 * The presentation instance a navigation command reaches, and the echo reports back.
 *
 * `instanceId` alone rather than the whole `presentationFile` the pointer's array and
 * `presentation.enter` carry. The path members are for launch coordination — a file that is
 * already open needs no path to be advanced — and requiring them would make navigation
 * unsayable in a `Linked` room, where nothing publishes file paths at all, so a console would
 * have to invent one and the Manager's echo could not satisfy the shape either. What is left is
 * exactly what mtngtools/mtng-dotnet-mono#375 says the id is for: *addressing inside the
 * implementation*.
 *
 * **Optional.** A one-lectern room omits it. Which instance a multi-lectern room means by an
 * absent id is the driver's to decide — actuation stops at the Manager, and what two instances
 * genuinely disagreeing means is open fog on map #42.
 *
 * Spread into a message: `z.strictObject({ ...presentationEnvelope(…), ...addressedInstance() })`.
 */
export const addressedInstance = () => ({
  instanceId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Which presentation instance this concerns — the machine or process with the file open. " +
        "MATCHED BYTE-WISE, NEVER PARSED, like presentationId, and loose on purpose: it exists " +
        "so a producer can reconcile with itself, not so anything routes on it. It is the same " +
        "id the pointer's files array is keyed by. Absent addresses the room's presentation " +
        "instance; which one a multi-lectern room means is the driver's, because actuation " +
        "stops at the Manager.",
    ),
});
