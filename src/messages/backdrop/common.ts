import { z } from "zod";

/**
 * Shared building blocks for the `backdrop` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces every backdrop message is assembled from.
 *
 * `backdrop` is a routing-key segment with **no Manager owner**: the floor app is a Client,
 * deliberately (the segment exists so the app does not squat on `window`). All five backdrop
 * messages are dual-language — the only plausible senders are TS-side consoles and scripts,
 * and splitting commands-dual/events-single would let a console send `hide` but not read the
 * `backdrop.hidden` that reports the clamp.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, no
 * `z.discriminatedUnion`, no `.nullable()`) are in the repo README, with the generator output
 * that settles each one.
 */

const envelopeCore = <TType extends string, TKind extends "event" | "command">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["backdrop"])
    .describe(
      "The owning domain — <domain> in the routing key. A segment with no Manager owner: the " +
        "floor app is a Client, and a segment does not acquire a Manager by existing.",
    ),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe("When the sender published this message, ISO-8601 UTC."),
});

/**
 * The envelope of a backdrop **command**: `{type, domain, kind, ts, target?}`.
 *
 * `target` is optional because both commands have a broadcast form (`backdrop.hide` /
 * `backdrop.show`) alongside the targeted one — hiding the floor is per-machine
 * troubleshooting, but showing the whole room again is one message.
 */
export const backdropCommandEnvelope = <TType extends string>(type: TType) => ({
  ...envelopeCore(type, "command"),
  target: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The machine this command addresses — the <machine> routing segment, the receiver's " +
        "Routing:MachineName. Absent on the broadcast forms, which every floor in the room " +
        "applies. A machine name, not an id: nothing enforces uniqueness on the value.",
    ),
});

/**
 * The envelope of a backdrop **event**: `{type, domain, kind, ts, target}`.
 *
 * `target` is required — the floor speaks only for its own machine, so every event is
 * published on the targeted key form.
 */
export const backdropEventEnvelope = <TType extends string>(type: TType) => ({
  ...envelopeCore(type, "event"),
  target: z
    .string()
    .min(1)
    .describe(
      "The machine reporting — the <machine> routing segment, the sender's " +
        "Routing:MachineName. Required: the floor speaks only for its own machine. A machine " +
        "name, not an id: nothing enforces uniqueness on the value.",
    ),
});
