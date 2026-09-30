import { z } from "zod";
import { phaseBody, phaseCue, phaseKey, timerHint } from "../../shared/timing.ts";

/**
 * The timer domain's **documents** — schemas that ride no exchange.
 *
 * A document is a PascalCase Zod export under `src/messages/`, like a message, so the emitter
 * walks it like one: one schema file, one `.g.cs`, the same drift gate. Unlike a message it
 * carries no envelope — no `type`, `domain`, `kind`, `ts` — because nothing routes it: a
 * configuration port reads it out of a configuration section through the mirror's own serializer
 * options (mtng-dotnet-mono `Core.Configuration`'s `ConfigurationJson.Read<T>(section,
 * WireJson.Options)`), and a host writes it in `appsettings.json` or its environment.
 * `WindowDesiredStateChangedPresets` — the presets member of the window state document — was the
 * precedent, hosted on a message; this is the first that stands alone (ADR-0033; Core.Wire spec
 * §Documents and fixtures ride the same pipeline).
 */

/**
 * One phase's named sets: `sets` maps a key to one array, and `default` names the key that
 * applies when nothing more specific does — the library-default rung of the ladder.
 *
 * A namespace-level `default` rather than a per-set flag: the map is unordered — a C# dictionary
 * on the other side — which has no portable tiebreak between two flagged sets, so naming the
 * winner keeps the answer unambiguous in both languages and each set a bare array. Keys are
 * scoped to the phase: `"standard"` in talk hints is unrelated to `"standard"` in qa hints.
 *
 * A set holds cues, or hints, never refs — which is what makes a preset's ref into a set
 * cycle-free.
 */
const namedSets = <TItem extends z.ZodType>(item: TItem, what: string) =>
  z.strictObject({
    sets: z
      .record(z.string().min(1), z.array(item))
      .describe(
        `Key → one phase's ${what} array, the set a ${what === "cue" ? "cuesRef" : "timerHintsRef"} ` +
          "names. Keys are scoped to this phase's namespace. A set holds " +
          `${what}s, never refs.`,
      ),
    // TEMPORARY AGENT DECISION APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
    // a `default` naming no key in `sets` is accepted and left to the resolver's fallthrough, over a `.check()` that it names one — a rejected document reverts the whole Timer:Presets level (ADR-0030), where a dangling key is one prop's fallthrough with a resolverNotes line, the posture every other ref on this wire has
    default: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Names the key in sets that applies when nothing more specific does — the " +
          "library-default rung of the ladder. Absent means no default. A namespace-level key " +
          "rather than a per-set flag, because the map is unordered and two flagged sets would " +
          "have no portable tiebreak. A default naming no key in sets is a dangling ref: it " +
          "contributes nothing, with a resolverNotes line — never a rejected document.",
      ),
  });

/**
 * `TimerPresets` — the value under the `Timer:Presets` configuration key: the room's own level
 * of the named-set and preset library, in the wire's dialect (ADR-0033 decision 6;
 * mtng-dotnet-mono `Core.TimerPresets` spec §The document).
 *
 * **One vocabulary for a host.** What they put on the wire — a calculated entry's `label`,
 * `load`, `phaseCues`, `timerHints`, `cuesRef`, `timerHintsRef` — and what they put in
 * configuration spell alike, because both are {@link phaseBody}. The three members match the
 * room-side `TimingLibraryLevel` one for one, and carry no `mt*` / `ss*` prefix: this is the
 * room's level, owned by neither meeting nor session. In a `Linked` room it is the third level,
 * after the session's and the meeting's — per key, filling gaps, never overriding; in a
 * `SelfContained` room it is the only one.
 *
 * **A preset body may carry refs** into the named sets — a deliberate divergence from upstream's
 * terminal, concrete-only preset bodies — so verbose cue and hint arrays are defined once and a
 * preset points at them. Inline beats ref inside a preset as everywhere; a ref into a set that
 * is not there contributes nothing for that prop, one `resolverNotes` line, and the ladder
 * continues. No cycle is possible: a set holds cues or hints, never refs.
 *
 * **Every per-phase container is a `z.partialRecord(phaseKey, …)`** — see `phaseKey`. Here it is
 * load-bearing rather than tidy: a preset's per-phase bodies, the cue sets and the hint sets are
 * three differently-shaped things keyed `intro`/`talk`/`qa`, and as literal objects their three
 * `intro`s would mirror into one C# class and silently lose two of the shapes.
 *
 * Every member is optional: a level may hold only sets, only presets, or nothing at all.
 */
export const TimerPresets = z
  .strictObject({
    phasePresets: z
      .record(
        z.string().min(1),
        z
          .partialRecord(
            phaseKey,
            phaseBody
              // TEMPORARY AGENT NAMING APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
              // titles `PhaseBody`, `NamedCueSets`, `NamedHintSets` over `PhasePreset`, `CueSets`, `HintSets` — each becomes the mirror's class name (`TimerPresetsPhaseBody`, …) because a record's value has no property to be named after; `PhaseBody` is the specs' own noun for the six-prop body and `Named*Sets` reads as the .NET `NamedSets<T>` it maps to, per item kind
              .meta({ title: "PhaseBody" })
              .describe(
                "A preset's body for one phase: label, load, phaseCues, timerHints, and the refs " +
                  "cuesRef / timerHintsRef into the named sets — resolved against the levels the " +
                  "room has, as every ref is; a preset body may carry refs, unlike upstream's. No " +
                  "minutes: a preset never changes how long a phase is.",
              ),
          )
          .describe(
            "One preset — a 'quick copy of everything': its body per phase, keyed intro / talk / " +
              "qa. A phase the preset is silent on is absent.",
          ),
      )
      .describe(
        "Preset name → the preset, the flat map prPhasesPreset names into. Behaviour and display " +
          "only; resolved at phase load, never affecting durations. A dangling name falls through " +
          "as if prPhasesPreset were unset, with a resolverNotes line.",
      )
      .optional(),
    cueSets: z
      .partialRecord(
        phaseKey,
        namedSets(phaseCue, "cue")
          .meta({ title: "NamedCueSets" })
          .describe("One phase's named cue sets: key → phaseCue array, and the key that applies by default."),
      )
      .describe("Per phase, the named cue sets a cuesRef resolves against at this level, keyed intro / talk / qa.")
      .optional(),
    hintSets: z
      .partialRecord(
        phaseKey,
        namedSets(timerHint, "hint")
          .meta({ title: "NamedHintSets" })
          .describe("One phase's named hint sets: key → timerHint array, and the key that applies by default."),
      )
      .describe("Per phase, the named hint sets a timerHintsRef resolves against at this level, keyed intro / talk / qa.")
      .optional(),
  })
  .describe(
    "The value under the Timer:Presets configuration key — the room's own level of the named-set " +
      "and preset library, in the wire's dialect: phasePresets (name → per-phase bodies, which may " +
      "carry refs), cueSets and hintSets (per phase, key → array plus a default). A document, not " +
      "a message: it rides no exchange and carries no envelope; a configuration port reads it per " +
      "access, so an edit reaches the next phase load. Every member is optional.",
  );

export type TimerPresets = z.infer<typeof TimerPresets>;
