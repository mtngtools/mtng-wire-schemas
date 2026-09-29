import { z } from "zod";

/**
 * Presentation-timing vocabulary shared by the `presentation` and `timer` domains.
 *
 * Nothing here is a message and nothing here has a `domain` — which is why `src/shared/` sits
 * outside `src/messages/` rather than beside the domains, where it would read as a fifth one
 * (mtngtools/mtng-dotnet-mono#380).
 *
 * **Why this vocabulary is shared rather than imported across the domains.** The `presentation`
 * group's calculated entries are built from it (`meeting-data.ts`) and ride
 * `presentation.state-changed` and `presentation.enter`; the timer's own events carry the
 * presentation domain's context back out (mtngtools/mtng-dotnet-mono#378); and the `TimerPresets`
 * document (`messages/timer/documents.ts`) is authored in it too, so a host spells one vocabulary
 * on the wire and in configuration (ADR-0033). The dependency therefore runs both ways, and both
 * `common.ts` files build Zod schemas at module top level — so mutual imports would be a circular
 * *runtime* dependency in which one side evaluates to `undefined` depending on entry order.
 *
 * **The module is the unit, not the individual export.** `timerCue` lives here even though only
 * the timer domain imports it today: it is what {@link phaseCue} reduces *into*, and the two are
 * halves of one concept (#382). Filing the authored half here and the reduced half in
 * `messages/timer/common.ts` would split one concept across two modules and invite the halves to
 * drift. Import count is evidence about a module, never a rule about an export — see the repo
 * README.
 *
 * **Nothing here is allow-listed.** These are pieces, not messages; each mirrors into C# scoped
 * to the message that embeds it (`PresentationStateChangedPhaseCues`, `TimerStateChangedCues`,
 * …) per the Core.Wire spec's nested-type rule — message plus the property's own name, not its
 * full path, so the name follows the property rather than where it sits. `WindowSlotContent`
 * is exported from the barrel because it is a closed union the TS side has to narrow on; none of
 * these is a union, so exporting them would only add duplicate top-level definitions to a surface
 * the README asks to keep small.
 *
 * **Two shapes carry a `.meta({ title })`** — {@link phaseCue} and {@link timerHint} — because the
 * `TimerPresets` document reaches them as the value of a `z.record()`, where there is no property
 * name for the mirror to name the C# class after: two untitled shapes there would both be
 * `Anonymous`, and the second would silently take the first's class. Under a named property the
 * property still wins (`…PhaseCues`, `…TimerHints`), so the title changes nothing on the messages
 * — see the README's authoring rules.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, no
 * `z.discriminatedUnion`, no `.nullable()`) are in the repo README.
 */

/**
 * Whether a timing magnitude is absolute minutes or a percentage.
 *
 * Closed on purpose, both here and upstream: an explicit discriminator, never inferred from sign
 * or magnitude, so a named set can travel across presentations of different lengths. A new unit
 * is a spec change, not a producer extension — which is the line that separates this from a hint
 * `kind`.
 */
const timingUnit = z.enum(["minutes", "percent"]);

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
 * One cue as **authored on a phase**, before the timer reduces it — the Calculated tier's cue,
 * carried symbolic. Mirrors upstream's `PresentationPhaseCue` field for field.
 *
 * **Symbolic, and that is the whole point.** `atUnits: 'percent'` measures `|at|` against the
 * phase's *starting timer value* — the value on the timer when the phase begins, after the timer
 * applies any `remaining` basis-switch and any up-front `floor`/`cap`. That denominator does not
 * exist until the phase starts, so a producer **cannot** compute the concrete threshold and does
 * not try: it publishes what was authored and the Timer manager reduces it at phase load, in
 * both dialects (ADR-0033). A ref (`cuesRef`) may stand in for the array; the Timer manager
 * dereferences it against the library levels the room has.
 *
 * Contrast {@link timerCue}, the **reduced** form the timer broadcasts as its own state: one
 * signed clock value, with `anchor` already collapsed into its sign.
 *
 * **`label` where upstream spells it `kind` — a deliberate divergence.** This wire has called the
 * string `label` since 0.5.0 and the cue-family prefix rule binds to that spelling; adopting
 * upstream's here would rename one string midway through its own pipeline, producer to
 * `furthestCue`. The divergence is in the name only — the meaning is upstream's exactly.
 */
export const phaseCue = z
  .strictObject({
    label: z
      .string()
      .min(1)
      .describe(
        "Cue name, e.g. 'warn' or 'timesUp'. Free-form, and carried verbatim into the reduced " +
          "cue the timer broadcasts. A label that begins with a cue family's name belongs to " +
          "that family — 'warn2' is a 'warn'. Consumer-facing only: it plays no part in the " +
          "timing calculation. (Upstream spells this field 'kind'.)",
      ),
    anchor: z
      .enum(["start", "end"])
      .optional()
      .describe(
        "Which end of the phase 'at' is measured from; absent means 'end'. Load-bearing " +
          "together with the sign of 'at', never inferred from it: 'end' fires before the end " +
          "on a positive value and after it on a negative one, 'start' fires after the start " +
          "on a positive value and before it on a negative one.",
      ),
    at: z
      .number()
      .describe(
        "The threshold MAGNITUDE, signed. What it measures is set by anchor, and its unit by " +
          "atUnits. Unlike upstream's phase-config 'minutes', a negative here is a direction " +
          "and never an auto-mode sentinel. (A calculated entry's own 'minutes' admits no " +
          "negative at all — resolution already answered auto.)",
      ),
    atUnits: timingUnit
      .optional()
      .describe(
        "The unit of |at|; absent means 'minutes'. 'percent' measures against the phase's " +
          "STARTING TIMER VALUE — what the timer starts the phase from, after any 'remaining' " +
          "basis-switch and up-front floor/cap. That is NOT the floor/cap basis, which is the " +
          "phase's initial calculated minutes. There is no [0,100] clamp: a percent may resolve " +
          "outside the phase, exactly as a large absolute value can. A percent cue is dropped " +
          "when the starting value is 0; an absolute cue is always kept.",
      ),
  })
  .meta({ title: "PhaseCue" })
  .describe(
    "A cue as authored on a phase, still symbolic: the Timer manager reduces it to a concrete " +
      "clock threshold at phase load, because a percent threshold's denominator is not fixed " +
      "until the phase starts.",
  );

/**
 * One entry in a phase's timer-hint array — how the phase's actual duration behaves under
 * overrun. Shape settled by mtngtools/mtng-dotnet-mono#381.
 *
 * A **flat tagged record rather than a union**: `z.discriminatedUnion` emits `oneOf`, which does
 * not survive the C# mirror, so the invariant rides the `.check()` below and the mirror carries
 * structure only. That is the same treatment `timerClock` and the pointer itself already get.
 *
 * **`kind` is deliberately open where `phase` and `load` are closed.** A closed enum fails the
 * *whole* message on an unrecognised value: an unknown hint kind would reject the `presentation`
 * group, which rejects the entire `presentation.state-changed`, blanking the room's presentation
 * state. Producers are deliberately not version-pinned to the room they feed, so a newer
 * producer's hint kind must degrade to *ignored*, never to *state lost*. What that gives up —
 * typo-catching at the boundary — is low-value, because the timer branches on `kind` and ignores
 * what it cannot implement either way.
 *
 * The field set stays closed regardless: upstream carries a `[key: string]: unknown` passthrough
 * on its custom arm, and that index signature is dropped here. A passthrough bag would break the
 * `strictObject` discipline every message follows, hand the mirror an untyped dictionary, and
 * nothing in the room could consume the contents. A host's own properties have a home instead —
 * the named bags `prMetadata` and `spMetadata`, opaque to the room by design
 * (mtngtools/mtng-dotnet-mono#717).
 */
export const timerHint = z
  .strictObject({
    kind: z
      .string()
      .min(1)
      .describe(
        "Which hint this is. OPEN VOCABULARY, not an enum: an unrecognised kind is a custom " +
          "entry to be ignored, never a reason to reject the message. The four kinds this room " +
          "implements are 'remaining' (switch the basis from the phase's own calculated minutes " +
          "to block-remaining), 'floor' (a minimum duration), 'cap' (a maximum duration) and " +
          "'protectQA' (talk-only, valueless: cap talk at its own calculated minutes so it " +
          "cannot borrow qa's time).",
      ),
    unit: timingUnit
      .optional()
      .describe(
        "The unit of value; absent means 'minutes'. A percent floor/cap is of the phase's " +
          "initial calculated minutes — the stable, pre-hint duration, not the live 'remaining' " +
          "basis and not a cue's starting timer value.",
      ),
    value: z
      .number()
      .optional()
      .describe(
        "The floor/cap magnitude. Present iff kind is 'floor' or 'cap', and absent on every " +
          "other kind including 'protectQA', which is a valueless cap-producer.",
      ),
    whenUnits: timingUnit
      .optional()
      .describe(
        "The one unit shared by all three when* thresholds below; absent means 'minutes'. A " +
          "percent here is of the presentation BLOCK (prEnd - prStart), not of the phase. " +
          "Closed, unlike kind: a new unit is a spec change, not a producer extension. Units " +
          "cannot be mixed across the three, which is never a real need since all three are " +
          "block-relative.",
      ),
    whenOverBy: z
      .number()
      .optional()
      .describe(
        "Cumulative presentation overage, against the scheduled prEnd, required for this entry " +
          "to qualify.",
      ),
    whenPrEarlyBy: z
      .number()
      .optional()
      .describe("How early the block must have started for this entry to qualify."),
    whenPrLateBy: z
      .number()
      .optional()
      .describe("How late the block must have started for this entry to qualify."),
  })
  .check((ctx) => {
    const { kind, value } = ctx.value;
    const carriesValue = kind === "floor" || kind === "cap";

    if (carriesValue && value === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["value"],
        message: "a 'floor' or 'cap' hint carries value",
      });
    }

    if (!carriesValue && value !== undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["value"],
        message: `a '${kind}' hint carries no value`,
      });
    }
  })
  .meta({ title: "TimerHint" })
  .describe(
    "One timer hint: how the phase's actual duration behaves under overrun. Evaluated once, at " +
      "phase load, to set the phase's starting timer value — never re-evaluated thereafter. " +
      "kind is an open vocabulary so an unrecognised entry degrades to ignored rather than " +
      "rejecting the message; value is present iff kind is 'floor' or 'cap'.",
  );

/**
 * What a timer should do when a phase becomes current — the closed five-value `load` directive.
 *
 * **Closed where hint `kind` is open**, and the asymmetry is upstream's shape rather than a
 * preference: `PhaseLoad` is modelled as a five-member union with no extensible arm, whereas
 * `timerHints` has one explicitly. `phase` on the pointer is already a ratified closed enum, so
 * closed is the consistent reading. Absence of `load` on the entry, not a sixth value, is how a
 * producer says nothing about loading — the ladder's later rungs (the preset's `load`, the host's
 * `phaseLoading`, then `clear`) answer in the Timer manager (ADR-0033).
 */
export const load = z
  .enum(["auto", "auto-paused", "clear", "ignore", "next"])
  .describe(
    "Authored intent for what a timer does when this phase becomes current: 'auto' sets the " +
      "phase and runs it, 'auto-paused' sets and holds it (a 'remaining'-basis phase runs " +
      "anyway — it cannot be staged), 'clear' clears the timer, 'ignore' does nothing, and " +
      "'next' sets and holds the NEXT phase as a preview. The runtime precedence below this " +
      "value — the host phaseLoading rung, the timerAutomation kill-switch — is the Timer " +
      "manager's and is not on the wire.",
  );

/**
 * The three phases a presentation has — the key of every per-phase container on this wire.
 *
 * Not the pointer's `phase`, which has a fourth arm, `none`: a container has nothing to hold
 * for no presentation.
 *
 * **Every "one thing per phase" object is a `z.partialRecord(phaseKey, …)` with a titled value,
 * never a `z.strictObject({ intro, talk, qa })`.** The JSON and the inferred TypeScript type are
 * identical — `{ intro?, talk?, qa? }`, unknown keys rejected — but the C# mirror names an inline
 * object after its property, so the literal form emits `…Intro`, `…Talk` and `…Qa` as three
 * classes of one shape with three copies of every enum beneath them, plus orphan `…Anchor2`,
 * `…Anchor3` enums where it dedupes the arrays' item class but not the item's enums; and where
 * two per-phase containers of different shapes sit in one document, their `Intro`s merge
 * silently. The record form emits one `IDictionary<string, T>` with one titled value class.
 * Verified against the real generator while authoring (mtngtools/mtng-dotnet-mono#733). The
 * emitted schema closes the keys with `propertyNames`, so the object is as strict as the literal.
 */
// TEMPORARY AGENT DECISION APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
// z.partialRecord(phaseKey, …) for every per-phase container (the group's prPhasesCalculated.phases, a TimerPresets preset, cueSets, hintSets) over the literal z.strictObject({ intro, talk, qa }) the specs spell — identical JSON and TS type; the literal form emits three same-shaped classes and enums per container plus orphan suffixed enums, and merges differently-shaped Intros in the document (verified against NJsonSchema 11.6.1); #733's third criterion is read as "closed", which propertyNames enforces, rather than "additionalProperties absent"
export const phaseKey = z.enum(["intro", "talk", "qa"]);

/**
 * The phase body — the four behaviour/display props a phase authors, plus the two refs that name
 * a cue or hint set in a library instead of spelling it inline.
 *
 * Shared by the `presentation` group's calculated entry (which adds the durations to it) and by
 * a `TimerPresets` preset (which is exactly this, per phase). Refs are legal in both: the Timer
 * manager dereferences them against the library levels its dialect has, and inline beats ref
 * when both are set — upstream's rule (ADR-0033). No `minutes`: a body is behaviour, never
 * duration.
 *
 * Every member is optional, and the optional strings are `.min(1)`: an empty label or an empty
 * key would be a second way of saying nothing, beside absence.
 */
// TEMPORARY AGENT DECISION APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
// `.min(1)` on the optional labels and library keys (label, cuesRef, timerHintsRef here; prPhasesPreset and a named set's `default` at their sites) over plain `z.string()` as upstream types them — an empty label or key is a second absence idiom, and this wire already spells its optional titles and ids `.min(1)`
export const phaseBody = z.strictObject({
  label: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The phase's display name, overriding the built-in one (Introduction / Talk / Questions). " +
        "Absent, the preset's stands, else the built-in name. What the timer broadcasts as the " +
        "top-level 'label' its own events carry.",
    ),
  load: load.optional(),
  phaseCues: z
    .array(phaseCue)
    .describe(
      "The phase's cue set as AUTHORED, in phaseCue's symbolic form — thresholds not reduced. " +
        "Inline beats cuesRef when both are set. Deliberately NOT the reduced timerCue the " +
        "timer broadcasts as 'cues' on timer.state-changed: the authored list and the reduced " +
        "set never share a spelling, because two shapes under one name merge silently in the " +
        "C# mirror.",
    )
    .optional(),
  timerHints: z
    .array(timerHint)
    .describe(
      "The phase's hint set, in authored order — later qualifying entries win over earlier " +
        "ones for the same bound. Inline beats timerHintsRef when both are set.",
    )
    .optional(),
  cuesRef: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The key of a named cue set in the library, used when phaseCues is absent. Resolved per " +
        "phase against the levels the room has — session, meeting, Timer:Presets — and a " +
        "dangling key falls through the ladder with a resolverNotes line, never an error.",
    ),
  timerHintsRef: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The key of a named hint set in the library, used when timerHints is absent. Resolved as " +
        "cuesRef is.",
    ),
});
