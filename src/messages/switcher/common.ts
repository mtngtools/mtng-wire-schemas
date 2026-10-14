import { z } from "zod";

/**
 * Shared building blocks for the `switcher` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces the switcher's documents, commands and requests are assembled from.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, a
 * titled shape wherever a `z.record()` reaches one) are in the repo README, with the
 * generator output that settles each one.
 */

/**
 * The envelope every switcher message carries: `{type, domain, kind, ts, target}`.
 *
 * **Every key is `switcher.<name>.<target>`**, on all three exchanges. `target` is the switcher's
 * configured name, `main` by default, so a second switcher later adds a name rather than
 * changing every key.
 *
 * Spread into a message, so the envelope fields lead and the body follows:
 * `z.strictObject({ ...switcherEnvelope("cut", "command"), ...body })`.
 */
export const switcherEnvelope = <TType extends string, TKind extends "event" | "command" | "rpc">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["switcher"])
    .describe("The owning domain — <domain> in the routing key. Names the role, not the vendor."),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe(
      "The PUBLISH instant — when this message went out, ISO-8601 UTC. A republish has the same " +
        "content and a new ts.",
    ),
  target: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .describe(
      "The switcher this message addresses — the <target> routing segment: the switcher's " +
        "configured name, 'main' by default, lowercase letters, digits and hyphens. Required on " +
        "every switcher message.",
    ),
});

/**
 * The switcher's link: `connected`, `connecting` or `dropped`.
 *
 * Carried by the basic state and, with the same values and meaning, by the tally. Anything but
 * `connected` means what the document reports is the last the switcher reported, not live.
 */
export const switcherLink = z
  .enum(["connected", "connecting", "dropped"])
  .describe(
    "The switcher's link: connected, connecting or dropped. Anything but connected means the " +
      "document holds the last the switcher reported, not live state.",
  );

/** An M/E number: the switcher's own label, "ME 1", numbered from 1. */
export const switcherMe = z
  .int()
  .min(1)
  .describe("The M/E — the switcher's own label, numbered from 1 (\"ME 1\").");

/**
 * A switcher source id, as the switcher numbers it.
 *
 * Black isn't an input, so the wire calls them all sources — the ATEM's own term.
 */
export const switcherSourceId = (what: string) =>
  z.int().min(0).describe(`${what}: the switcher's source id, non-negative.`);

/**
 * A bus — an M/E's program or preview: `{source, bundled}`.
 *
 * `bundled` expands SuperSource only: for SuperSource, the sources in its enabled boxes, in box
 * order; for any other source it is empty. Another M/E's program isn't expanded, since every M/E
 * is in the same message; keyers aren't; SuperSource's art is in the advanced state.
 *
 * **Mirrors as two classes**, `SwitcherStateChangedProgram` and `SwitcherStateChangedPreview`:
 * the mirror names an object under a property after the property, and a title does not override
 * that hint (README, Authoring rules), so the duplication is the generator's, not a second shape.
 */
export const switcherBus = z
  .strictObject({
    source: switcherSourceId("The source on this bus"),
    bundled: z
      .array(switcherSourceId("A source in an enabled box"))
      .describe(
        "For SuperSource, the sources in its enabled boxes, in box order; for any other source, " +
          "empty. Only SuperSource is expanded.",
      ),
  })
  .describe(
    "A bus: the source on it, and for SuperSource the sources in its enabled boxes, in box order.",
  );

/**
 * One M/E in the basic state: `{me, program, preview, inTransition}`. Mirrors as
 * `SwitcherStateChangedMixEffects`, after the array that holds it, as `TimerStateChangedCues`.
 */
export const switcherMixEffect = z
  .strictObject({
    me: switcherMe,
    program: switcherBus,
    preview: switcherBus,
    inTransition: z
      .boolean()
      .describe(
        "true while the M/E's transition runs. The transition position is not on the wire; this " +
          "carries what a reader needs.",
      ),
  })
  .describe("One M/E: its program and preview buses, and whether its transition is running.");

/**
 * One source in the advanced state: `{id, shortName, longName}`. Mirrors as
 * `SwitcherDetailsChangedSources`, after the array that holds it.
 */
export const switcherSource = z
  .strictObject({
    id: switcherSourceId("The source"),
    shortName: z
      .string()
      .describe(
        "The source's short name, as the switcher reports it; may be empty. Which sources get a " +
          "console key is the console's rule — a source with a short name.",
      ),
    longName: z.string().describe("The source's long name, as the switcher reports it; may be empty."),
  })
  .describe("One source the switcher reports: its id and its two names.");

/**
 * One SuperSource box: `{box, enabled, source}`. Mirrors as `SwitcherDetailsChangedBoxes`, after
 * the array that holds it.
 */
export const switcherSuperSourceBox = z
  .strictObject({
    box: z.int().min(1).describe("The box, numbered from 1."),
    enabled: z.boolean().describe("Whether the box is enabled."),
    source: switcherSourceId("The source in the box"),
  })
  .describe("One SuperSource box: its number, whether it is enabled, and its source.");

/**
 * A SuperSource's art: `{fill, key, placement}`. Mirrors as `SwitcherDetailsChangedArt`, after
 * its property, with `SwitcherDetailsChangedArtPlacement` for the placement.
 */
export const switcherSuperSourceArt = z
  .strictObject({
    fill: switcherSourceId("The art's fill source"),
    key: switcherSourceId("The art's key source"),
    placement: z
      .enum(["background", "foreground"])
      .describe("Where the art sits: background, behind the boxes, or foreground, over them."),
  })
  .describe("A SuperSource's art: its fill and key sources, and its placement.");

/**
 * One SuperSource in the advanced state: `{superSource, id, boxes, art}`. Mirrors as
 * `SwitcherDetailsChangedSuperSources`, after the array that holds it.
 */
export const switcherSuperSource = z
  .strictObject({
    superSource: z
      .int()
      .min(1)
      .describe("The SuperSource, numbered from 1 — some models have two."),
    id: switcherSourceId("The SuperSource's own source id"),
    boxes: z.array(switcherSuperSourceBox).describe("The SuperSource's boxes, in box order."),
    art: switcherSuperSourceArt,
  })
  .describe("One SuperSource: its number, its source id, its boxes and its art.");

/**
 * A virtual name: `^[a-z0-9-]+$`, room-computers' rule, no length limit.
 */
export const switcherComputerName = z
  .string()
  .regex(/^[a-z0-9-]+$/)
  .describe(
    "A virtual name: lowercase letters, digits and hyphens (^[a-z0-9-]+$), room-computers' rule.",
  );

/**
 * One mapped computer's light: `{tally, color?}`.
 *
 * `color` is present exactly when `tally` isn't `off` — enforced by the tally document's
 * `.check()`, since the mirror carries structure only.
 *
 * **Titled `Computer`** because it is the value of a `z.record()`, where there is no property name
 * for the mirror to name the C# class after; it mirrors as `SwitcherTallyChangedComputer`,
 * following `RoomComputersStateChangedComputer`.
 */
export const switcherTallyComputer = z
  .strictObject({
    tally: z
      .enum(["program", "preview", "off"])
      .describe("The computer's light, in the switcher's words: program, preview or off."),
    color: z
      .string()
      .regex(
        /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
        "a colour is '#rrggbb' or '#rrggbbaa' — the leading '#' is required",
      )
      .optional()
      .describe(
        "The light's colour, '#rrggbb' or '#rrggbbaa'. Present exactly when tally isn't off.",
      ),
  })
  .meta({ title: "Computer" })
  .describe("One mapped computer's light: its tally and, when lit, its colour.");
