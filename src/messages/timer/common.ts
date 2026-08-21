import { z } from "zod";

/**
 * Shared building blocks for the `timer` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces every timer message is assembled from.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, no
 * `z.discriminatedUnion`, no `.nullable()`) are in the repo README, with the generator output
 * that settles each one.
 */

/**
 * The envelope every wire message carries: `{type, domain, kind, ts, target}`.
 *
 * `type` / `domain` / `kind` are what the .NET backbone port reads off a payload to derive its
 * exchange and `<domain>.<name>[.<target>]` routing key, so the key is a pure function of the
 * message and cannot drift from this schema.
 *
 * Spread into a message, so the envelope fields lead and the body follows:
 * `z.strictObject({ ...timerEnvelope("pause", "command"), ...body })`.
 */
export const timerEnvelope = <TType extends string, TKind extends "event" | "command" | "rpc">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z.enum(["timer"]).describe("The owning domain — <domain> in the routing key."),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe(
      "The Timer manager's authoritative server timestamp. Every broadcast is an anchor rather " +
        "than a tick, so a client reconciles its own clock against this before interpolating.",
    ),
  target: z
    .string()
    .min(1)
    .describe(
      "The timer instance this message addresses — the <target> routing segment. Required on " +
        "every timer message: a timer is a keyed instance, and 'presentation-phase' is the " +
        "well-known key of the standing one.",
    ),
});

/**
 * A cue threshold on the timer's own clock: fire `label` when the clock descends past
 * `atDuration`. Generic — resolved from presentation config at load, then frozen, so nothing
 * downstream re-evaluates the symbolic form.
 */
export const timerCue = z
  .strictObject({
    label: z
      .string()
      .min(1)
      .describe(
        "Cue name, e.g. 'warn' or 'timesUp'. Free-form, and carried verbatim in firedCues, " +
          "furthestCue and cue-fired. A label that begins with a cue family's name belongs to " +
          "that family — 'warn2' is a 'warn'.",
      ),
    atDuration: z
      .int()
      .describe("Clock value the cue fires at, in signed whole seconds — negative in overtime."),
  })
  .describe("A cue threshold on the timer's clock: fire when the clock descends past atDuration.");

/**
 * The closed vocabulary of cue **families** — the coarse, ordered signal a display switches on.
 *
 * Cue labels are free-form so an organizer can author `warn2` or `warn-hard`, but a display
 * that had to pattern-match arbitrary labels would be evaluating, which is exactly what the
 * anchor-and-switch design exists to avoid. A label **belongs to the family whose name it
 * begins with**, so the free vocabulary and the closed one stay in step without a mapping
 * table: `warn2` is a `warn`, `over-hard` is an `over`.
 *
 * Ordered along the countdown, and `none` is the sentinel for "nothing has fired".
 */
export const timerCueFamily = z.enum(["none", "warn", "timesUp", "over"]);

/**
 * The timer's lifecycle and the one value that goes with it.
 *
 * A **tagged record rather than a discriminated union**, because `oneOf` does not survive the
 * mirror to C# — see the README. The invariant the union would have carried is enforced by the
 * `.check()` below, so this side still rejects a malformed clock; JSON Schema and C# carry the
 * structure only.
 */
export const timerClock = z
  .strictObject({
    lifecycle: z
      .enum(["running", "paused", "cleared"])
      .describe("Which arm this is. 'cleared' is retained, not absent."),
    endsAt: z
      .iso
      .datetime()
      .optional()
      .describe(
        "When the clock reaches zero, as an absolute instant — present iff running. Absolute " +
          "rather than a remaining count so a skewed client can reconcile against ts, and so " +
          "recovery after a restart recomputes the live clock from endsAt versus now.",
      ),
    duration: z
      .int()
      .optional()
      .describe("The held clock value in signed whole seconds — present iff paused."),
  })
  .check((ctx) => {
    const { lifecycle, endsAt, duration } = ctx.value;

    if (lifecycle === "running" && endsAt === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["endsAt"],
        message: "a running clock carries endsAt",
      });
    }

    if (lifecycle === "paused" && duration === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["duration"],
        message: "a paused clock carries duration",
      });
    }
  })
  .describe(
    "The timer's lifecycle and the one value that goes with it: 'running' carries endsAt, " +
      "'paused' carries duration, 'cleared' carries neither.",
  );
