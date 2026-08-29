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
 * **No `<target>` segment.** Presentation state is room-singular, so the routing keys are
 * exactly `presentation.state-changed` and `presentation.current-state`. The timer's target
 * exists because a timer is a keyed instance; here a target would have one forever-value.
 *
 * Spread into a message, so the envelope fields lead and the body follows:
 * `z.strictObject({ ...presentationEnvelope("state-changed", "event"), ...body })`.
 */
export const presentationEnvelope = <TType extends string, TKind extends "event" | "rpc">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["presentation"])
    .describe(
      "The owning domain — <domain> in the routing key. Room-singular, so the key stops here: " +
        "there is no <target> segment on any presentation message.",
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
