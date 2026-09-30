import { z } from "zod";
import { phaseBody, phaseKey } from "./timing.ts";

/**
 * The meeting-data entity vocabulary — the presentation and the speaker, as upstream's
 * `PresentationFull` and `SpeakerBase` (`mtng-mono` `packages/core/src/data/meeting.ts`) in this
 * wire's dialect (ADR-0033; mtngtools/mtng-dotnet-mono#714, #715, #717).
 *
 * **Field names and structure are upstream's; encodings and vocabularies are this wire's.** Every
 * datetime is ISO-8601 UTC where upstream holds unix milliseconds; the phase vocabulary is
 * `timing.ts`'s (`label` where upstream spells the cue field `kind`, `phaseCues` where it spells
 * the array `cues`); every union is a tagged record with a `.check()`, because `oneOf` does not
 * survive the C# mirror; and there is no passthrough — a host's own properties ride a named bag.
 *
 * **Required where the type has an honest empty, optional where it does not.** `prId`, `prTitle`
 * (`""` allowed), a speaker's `spId` and `spFullName` (`""` allowed), and a calculated entry's
 * `minutes` and `source` are required. Every datetime is optional — a datetime has no honest
 * empty, and a sentinel window would feed the hint machinery garbage — and the later of a pair
 * carries the earlier. Arrays are three-state: absent is *unknown*, `[]` is *none*, populated is
 * the list. A consumer that wants upstream's required shape takes the **reliable view** its own
 * side builds (`Core.MeetingData`'s `PresentationFull` in .NET; `mtng-mono`'s helper in TS),
 * which fills with the type's honest empty and says which members it filled;
 * `fixtures/meeting-data/` is that fill's contract. The room's managers read the raw shape.
 *
 * **The named bags.** `prMetadata` and `spMetadata` are `z.record(z.string(), z.unknown())` under
 * upstream's keys — never a catchall on the carrying object, so a misspelt schema field is still a
 * rejected typo. Optional, `{}` allowed, opaque to the room: nothing in the room reads a key, the
 * consumer is the host's own display or integration code, and whatever a host puts there is
 * Content wherever it is logged (#717).
 *
 * **Raw `prPhases` never rides.** The group carries the Calculated tier — `prPhasesCalculated`,
 * every phase, refs intact — and `prPhasesPreset`; two differently-shaped objects keyed
 * `intro`/`talk`/`qa` in one message would merge silently in the C# mirror, and the room uses
 * nothing from the raw tier.
 *
 * The family is `mt` / `rm` / `ss` / `pr` / `sp`; `presentation` and `speaker` are here now, the
 * rest when an effort brings them onto the wire. The `session` group stays in
 * `presentation-context.ts` until then. Nothing here is allow-listed: each shape mirrors into C#
 * scoped to the message that embeds it.
 */

/**
 * A host's own properties, under upstream's key for the entity that owns them.
 *
 * A record rather than a `.catchall()`: the carrying object stays a `strictObject`, the host gets
 * a clearly delimited space, and the C# member is a real named `IDictionary<string, object>`
 * whose values arrive as `JsonElement`. A fresh schema per owner, so each carries its own
 * description; both emit the same dictionary and no class of their own.
 */
const metadataBag = (owner: "presentation" | "speaker") =>
  z
    .record(z.string(), z.unknown())
    .describe(
      `Host-defined properties of the ${owner}, any shape, OPAQUE TO THE ROOM: nothing in the ` +
        "room reads, validates or acts on a key, and the consumer is the host's own display or " +
        "integration code. Optional, and {} is allowed — absent says nothing, {} says " +
        "explicitly empty. No prefix rule and no reserved keys inside: the pr/sp standard " +
        "governs the schema's own members and stops here. Content wherever it is logged.",
    );

/**
 * A speaker — upstream's `SpeakerBase`, member for member.
 *
 * `spOrder` is two members where upstream has one `string | number`: an untagged union collapses
 * to its first branch in the C# mirror, and two typed members lose nothing it allowed, each
 * mirroring to its natural C# type. At most one is set. `spEmail` and `spPicURL` are plain
 * strings, no `.email()` / `.url()`: upstream is lenient and the wire stays as lenient as its
 * source (mtngtools/mtng-dotnet-mono#715).
 */
export const speaker = z
  .strictObject({
    spId: z
      .string()
      .min(1)
      .describe(
        "Opaque id of the speaker. MATCHED BYTE-WISE, NEVER PARSED, like prId: no structure is " +
          "promised and equality is the only operation defined on it. It is what a " +
          "presentation's prModeratorIds names.",
      ),
    spAltId: z.string().optional().describe("An alternate id for the speaker, as upstream carries it."),
    spSlug: z.string().optional().describe("The speaker's URL-safe slug."),
    spFullName: z
      .string()
      .describe(
        "The speaker's display name. Required, and '' is allowed: a producer always has " +
          "something to call the person, so the empty string is an honest empty where an " +
          "absent name would be unknown.",
      ),
    spFirstName: z.string().optional().describe("Given name."),
    spLastName: z.string().optional().describe("Family name."),
    spFullOrg: z.string().optional().describe("The speaker's affiliation in full."),
    spOrgName: z.string().optional().describe("The affiliation's name alone."),
    spOrgLoc: z.string().optional().describe("The affiliation's location."),
    spEmail: z
      .string()
      .optional()
      .describe("Contact address. A plain string, as upstream is — the wire stays as lenient as its source."),
    spOrder: z
      .number()
      .optional()
      .describe(
        "Numeric sort position among the presentation's speakers. Not with spOrderKey — " +
          "upstream's one 'string | number' is two typed members here because an untagged " +
          "union does not survive the C# mirror.",
      ),
    spOrderKey: z
      .string()
      .optional()
      .describe(
        "String sort key among the presentation's speakers, for producers that order by keys " +
          "like '1a'. Not with spOrder.",
      ),
    spPicURL: z.string().optional().describe("Where the speaker's picture is. A plain string, as upstream is."),
    spMetadata: metadataBag("speaker").optional(),
  })
  .check((ctx) => {
    const { spOrder, spOrderKey } = ctx.value;

    if (spOrder !== undefined && spOrderKey !== undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["spOrderKey"],
        message: "spOrder and spOrderKey are one-of — set at most one",
      });
    }
  })
  .describe(
    "A speaker — upstream's SpeakerBase in the wire's dialect. spId and spFullName are required " +
      "('' allowed on the name); every other sp* member is optional and verbatim; spOrder and " +
      "spOrderKey are one-of; spMetadata is a named bag, opaque to the room.",
  );

/**
 * One phase at the **Calculated** tier — the phase body with its durations resolved and its cue
 * and hint sources still symbolic. Upstream's `PresentationCalculatedPhase`, in the dialect.
 *
 * Durations are resolved here because they depend only on the presentation's own data, so they
 * are computable upstream and cacheable. Refs ride along intact — `cuesRef`, `timerHintsRef` on
 * the body — because dereferencing them needs the library, and the library is the room's
 * (ADR-0033). A producer may pre-resolve; inline beats ref, so both are one wire shape.
 */
export const calculatedPhase = phaseBody
  .extend({
    minutes: z
      .number()
      .nonnegative()
      .describe(
        "The phase's CALCULATED duration in minutes, fractions allowed; 0 for a no-time phase " +
          "or a starved fill. Required — the Calculated tier always has an answer. The Timer " +
          "manager's allocation basis, and the denominator a percent floor or cap measures " +
          "against; an authored, qualifying 'remaining' hint still wins the basis.",
      ),
    start: z
      .iso
      .datetime()
      .optional()
      .describe(
        "Where the phase sits in the block — its calculated start, ISO-8601 UTC. Equal to end " +
          "for a zero-length phase. Optional: a producer without a schedule has no honest " +
          "value to send.",
      ),
    end: z
      .iso
      .datetime()
      .optional()
      .describe(
        "The phase's calculated end, ISO-8601 UTC. end carries start — an end without a start " +
          "says nothing.",
      ),
    source: z
      .enum(["concrete", "fill", "no-time", "normalized-fill", "normalized-no-time"])
      .describe(
        "How the duration came to be what it is: 'concrete' was authored, 'fill' absorbed the " +
          "block time the concrete phases left, 'no-time' is off the committed clock, and the " +
          "two 'normalized-*' arms record that the input asked for two or more fills and the " +
          "resolver's priority fallback picked a winner. Closed — upstream's " +
          "PhaseCalculatedTiming.source, verbatim.",
      ),
  })
  .check((ctx) => {
    const { start, end } = ctx.value;

    if (end !== undefined && start === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["start"],
        message: "end carries start — a phase's end says nothing without its start",
      });
    }
  })
  .meta({ title: "CalculatedPhase" })
  .describe(
    "One phase at the Calculated tier: the phase body (label, load, phaseCues, timerHints, " +
      "cuesRef, timerHintsRef) with its durations resolved — minutes and source required, start " +
      "and end optional with end carrying start. Cue and hint sources stay symbolic and refs " +
      "stay refs; the Timer manager resolves and reduces at phase load.",
  );

/**
 * How the calculated phases fit the block — upstream's `PhaseFit`, a three-arm union, as a flat
 * tagged record: `fit` selects the arm and the arm's one number rides its own optional member.
 */
export const phaseFit = z
  .strictObject({
    fit: z
      .enum(["exact", "slack", "overflow"])
      .describe(
        "How the phases fit the block: 'exact' fills it, 'slack' leaves slackMin unused, " +
          "'overflow' exceeds it by overMin.",
      ),
    slackMin: z.number().optional().describe("Unused block minutes — present iff fit is 'slack'."),
    overMin: z.number().optional().describe("Minutes over the block — present iff fit is 'overflow'."),
  })
  .check((ctx) => {
    const { fit, slackMin, overMin } = ctx.value;

    if (fit === "slack" && slackMin === undefined) {
      ctx.issues.push({ code: "custom", input: ctx.value, path: ["slackMin"], message: "a 'slack' fit carries slackMin" });
    }

    if (fit !== "slack" && slackMin !== undefined) {
      ctx.issues.push({ code: "custom", input: ctx.value, path: ["slackMin"], message: `an '${fit}' fit carries no slackMin` });
    }

    if (fit === "overflow" && overMin === undefined) {
      ctx.issues.push({ code: "custom", input: ctx.value, path: ["overMin"], message: "an 'overflow' fit carries overMin" });
    }

    if (fit !== "overflow" && overMin !== undefined) {
      ctx.issues.push({ code: "custom", input: ctx.value, path: ["overMin"], message: `an '${fit}' fit carries no overMin` });
    }
  })
  .describe(
    "The block fit as a tagged record — upstream's PhaseFit union, flattened because oneOf does " +
      "not survive the C# mirror: fit selects the arm, slackMin rides 'slack' and overMin rides " +
      "'overflow'.",
  );

/**
 * Upstream's `PresentationCalculatedTiming` — the cached complex-resolver output a presentation
 * carries: its phases at the Calculated tier, how they fit the block, and the resolver's notes.
 *
 * `phases` is a per-phase record keyed by {@link phaseKey} — the same `{ intro?, talk?, qa? }`
 * on the wire and in TypeScript as upstream's object, and one `…CalculatedPhase` class in the
 * mirror rather than three (see `phaseKey` for the evidence).
 */
export const presentationCalculatedTiming = z
  .strictObject({
    phases: z
      .partialRecord(phaseKey, calculatedPhase)
      .describe(
        "The phases that exist, keyed intro / talk / qa, each at the Calculated tier. A phase the " +
          "presentation does not have is absent; a phase that exists with no committed time is " +
          "present with minutes 0. No other key is legal.",
      ),
    fit: phaseFit,
    resolverNotes: z
      .array(z.string())
      .describe(
        "The resolver's data-quality diagnostics — '≥2 fill normalized' and the like. Not the " +
          "cue schedule. Required, and may be empty.",
      ),
  })
  .describe(
    "Upstream's PresentationCalculatedTiming: the calculated phases, how they fit the block, and " +
      "the resolver's notes. Cached complex-resolver output, carried so the room can resolve " +
      "refs and reduce without recomputing durations.",
  );

/**
 * The presentation — upstream's `PresentationFull`, field for field, in the wire's dialect.
 *
 * On `presentation.enter` and `presentation.state-changed` this is the optional `presentation`
 * group (`presentation-context.ts` exports it under that name). Its `prId` equals the core's —
 * the one cross-group invariant, enforced by the carrying message's `.check()`, because a group
 * filed under the wrong id misfiles everything in it. The group's own invariants are here:
 * `prEnd` carries `prStart`, and `prModerators` / `prModeratorIds` are one-of.
 *
 * Member order is upstream's `PresentationBase`, then `PresentationFull`'s two, then the id form
 * this wire adds beside them.
 */
export const presentation = z
  .strictObject({
    prId: z
      .string()
      .min(1)
      .describe(
        "Opaque id of the presentation. MATCHED BYTE-WISE, NEVER PARSED: no structure is " +
          "promised and equality is the only operation defined on it. On a message that " +
          "carries this group it equals the prId on the message's core.",
      ),
    prAltId: z.string().optional().describe("An alternate id for the presentation, as upstream carries it."),
    prAbstractId: z.string().optional().describe("The id of the presentation's abstract in the host's system."),
    prSlug: z.string().optional().describe("The presentation's URL-safe slug."),
    prTitle: z
      .string()
      .describe(
        "The presentation's title. Required, and '' is allowed: a producer always has a title " +
          "— the file name if nothing else — so the empty string is an honest empty where an " +
          "absent title would be unknown.",
      ),
    prAltTitle: z.string().optional().describe("An alternate title — a short form, a translation."),
    prStart: z
      .iso
      .datetime()
      .optional()
      .describe(
        "The block's SCHEDULED start, ISO-8601 UTC. Not actualPrStart, which is the live fact " +
          "on the message's core. Optional — a producer without a schedule has no honest value " +
          "to send. With prEnd it is the block window a percent-unit timer hint threshold is a " +
          "percentage of.",
      ),
    prEnd: z
      .iso
      .datetime()
      .optional()
      .describe(
        "The block's SCHEDULED end, ISO-8601 UTC. prEnd carries prStart — a window's end says " +
          "nothing without its start.",
      ),
    prStartStr: z.string().optional().describe("Upstream's preformatted display string for the start."),
    prEndStr: z.string().optional().describe("Upstream's preformatted display string for the end."),
    prType: z.string().optional().describe("The host's presentation type — 'keynote', 'lightning', whatever its programme uses."),
    prTags: z
      .array(z.string())
      .describe("The host's tags. Three-state: absent is unknown, [] is explicitly none, populated is the list.")
      .optional(),
    prSecondaryTags: z
      .array(z.string())
      .describe("The host's secondary tags. Three-state, like prTags.")
      .optional(),
    prMetadata: metadataBag("presentation").optional(),
    prPhasesPreset: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The key of a phases preset in the library — upstream's 'quick copy of everything', for " +
          "speaker systems that can set one field. Resolved at phase load against the levels " +
          "the room has, Timer:Presets among them; a dangling key falls through as if unset, " +
          "with a resolverNotes line. Never affects durations.",
      ),
    prPhasesCalculated: presentationCalculatedTiming.optional(),
    prSpeakers: z
      .array(speaker)
      .describe(
        "The presentation's speakers. Three-state: absent is unknown, [] is explicitly none — a " +
          "video-only slot — and populated is the list.",
      )
      .optional(),
    prModerators: z
      .array(speaker)
      .describe(
        "The presentation's moderators as speaker objects. Not with prModeratorIds. Three-state " +
          "like prSpeakers.",
      )
      .optional(),
    prModeratorIds: z
      .array(z.string().min(1))
      .describe(
        "The presentation's moderators as ids of speakers the consumer can reach — on this " +
          "message's prSpeakers, or in its own cache. Not with prModerators: upstream allows " +
          "'SP[] | string[]' on its resolved shape, and an untagged union does not survive the " +
          "C# mirror, so the id form is its own member. [] allowed.",
      )
      .optional(),
  })
  .check((ctx) => {
    const { prStart, prEnd, prModerators, prModeratorIds } = ctx.value;

    if (prEnd !== undefined && prStart === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["prStart"],
        message: "prEnd carries prStart — a window's end says nothing without its start",
      });
    }

    if (prModerators !== undefined && prModeratorIds !== undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["prModeratorIds"],
        message: "prModerators and prModeratorIds are one-of — set at most one",
      });
    }
  })
  .describe(
    "The presentation — upstream's PresentationFull, field for field in the wire's dialect. On " +
      "presentation.enter and presentation.state-changed it is the optional presentation group: " +
      "never on phase 'none', and a producer may always send it whatever the room's dialect. " +
      "Identity and display; the scheduled window (prEnd carries prStart); prSpeakers, and " +
      "prModerators or prModeratorIds (one-of); prMetadata, a named bag opaque to the room; and " +
      "the Calculated tier — prPhasesCalculated for every phase, refs intact, with " +
      "prPhasesPreset. Raw prPhases never rides. Its prId equals the core's.",
  );
