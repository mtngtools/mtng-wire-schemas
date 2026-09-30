import { z } from "zod";
import { presentation } from "./meeting-data.ts";

/**
 * The optional groups the `presentation` and `timer` domains share — `session` and `files`
 * defined here, and the `presentation` group assembled from `meeting-data.ts` (ADR-0033,
 * superseding ADR-0024; mtngtools/mtng-dotnet-mono#372, #378, #379, #380, #714, #720, #722).
 *
 * The four members on the pointer's core — `phase`, `prId`, `actualPrStart`, `enteredAt` — are
 * needed in both dialects and are always present. The groups are what a producer knows besides,
 * carried on the same message: the presentation itself, the session containing it, and the
 * machines with a file open for it. `presentation.state-changed` and `presentation.enter` carry
 * all three (`enter` with a singular `file`); `timer.state-changed` and `timer.cue-fired` carry
 * the key of what they time in both dialects, and `session` and `files` in a `SelfContained`
 * room — never the `presentation` group.
 *
 * **A producer may always send a group, whatever the room's dialect.** `DataLoadMode` names the
 * source the Timer manager reads — its schedule or the pointer — not what may arrive: a `Linked`
 * manager takes only the key from the pointer and never falls back to the group, and a display
 * reads one source per field and never arbitrates freshness between the group and the Meeting
 * data manager's broadcast. A producer that sends ids only confirms the room is `Linked` first;
 * one that always sends the group need not know.
 *
 * **Each group is independently optional; within a group its required members are required.** Not
 * all-or-nothing, because real producers have partial knowledge — a live panel with no file has
 * no `files`, a presentation with no cues authored is ordinary, a producer may not model sessions
 * at all. Not a flat bag either: dozens of optional members would carry no invariants, leaving
 * every consumer its own defensive join, and some pairs are meaningless apart — `prEnd` without
 * `prStart`, or percent-unit hints without the block window they are a percentage of.
 *
 * **An empty group is not a third state.** A `session` whose members are all absent says exactly
 * what absence of the group says, so its `.check()` rejects it; `files` is `.min(1)`; the
 * `presentation` group has required members and cannot be empty. `oneOf` does not survive the C#
 * mirror, so every invariant here rides a `.check()` and the mirror carries structure only,
 * exactly as the pointer's own body invariant does.
 *
 * **`phase: none` carries none of them.** The groups describe a presentation, and `none` is the
 * absence of one — each carrying message's `.check()` enforces it.
 *
 * Field prefixes are the upstream glossary's — `ss*` session, `pr*` presentation, `sp*` speaker —
 * and `pr` is the presentation prefix in every MT repo: `prId`, `prSubDirectory`.
 */

/**
 * The `presentation` group — the presentation entity, carried whole.
 *
 * The same schema object as {@link presentation}, so it mirrors as one C# class and documents
 * itself once, on the shape. It is spelled out on `presentation.enter` and
 * `presentation.state-changed` rather than folded into {@link presentationContext}: the timer's
 * events carry `session` and `files` only, plus the key (`prId`, `phase`), because carrying the
 * group there would put the authored `phaseCues` beside the reduced `cues` on one message — the
 * same-name collision `phaseCues` exists to avoid — and a title is the pointer's job
 * (mtngtools/mtng-dotnet-mono#720).
 *
 * Never on phase `none`. Its `prId` equals the core's — the one cross-group invariant, enforced
 * by each carrying message's `.check()`. Everything the group contains, and every invariant
 * inside it, is on the entity in `meeting-data.ts`.
 */
export const presentationGroup = presentation;

/**
 * The session containing the block.
 *
 * Wholly optional as a group: a third-party producer may not model sessions at all, and a room
 * that never shows session context loses nothing by its absence. The four members are what
 * displays need today; the rest of the session entity — moderators, its own bag — is a future
 * effort, and joins `meeting-data.ts` when it comes.
 */
export const sessionGroup = z
  .strictObject({
    ssId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Opaque id of the session. MATCHED BYTE-WISE, NEVER PARSED, like prId: no structure is " +
          "promised and equality is the only operation defined on it.",
      ),
    ssTitle: z.string().min(1).optional().describe("The session's title, for displays."),
    ssStart: z.iso.datetime().optional().describe("The session's scheduled start, ISO-8601 UTC."),
    ssEnd: z.iso.datetime().optional().describe("The session's scheduled end, ISO-8601 UTC."),
  })
  .check((ctx) => {
    const { ssId, ssTitle, ssStart, ssEnd } = ctx.value;

    if (ssId === undefined && ssTitle === undefined && ssStart === undefined && ssEnd === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [],
        message: "an empty session group says what absence says — omit it",
      });
    }

    if (ssEnd !== undefined && ssStart === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["ssStart"],
        message: "ssEnd carries ssStart — a window's end says nothing without its start",
      });
    }
  })
  .describe(
    "The session containing the block: its id, its title for displays, and its scheduled " +
      "window. Every member is optional and at least one is present; ssEnd carries ssStart. A " +
      "producer that does not model sessions omits the group.",
  );

/**
 * One presentation computer and the file it has open.
 *
 * A room may have **more than one presentation computer**, so the room's *state* carries an array
 * of these while commands and the navigation echo carry exactly one — a command comes from and
 * addresses one instance (mtngtools/mtng-dotnet-mono#379).
 */
export const presentationFile = z
  .strictObject({
    instanceId: z
      .string()
      .min(1)
      .describe(
        "Opaque id of the presentation instance — the machine or process with the file open. " +
          "MATCHED BYTE-WISE, NEVER PARSED, like prId, and loose on purpose: it exists so a " +
          "producer can reconcile with itself, not so anything routes on it. It is the files " +
          "array's uniqueness key.",
      ),
    path: z
      .strictObject({
        partialPath: z
          .string()
          .min(1)
          .optional()
          .describe("The file's path relative to the producer's own presentation root."),
        prSubDirectory: z
          .string()
          .min(1)
          .optional()
          .describe("The sub-directory the presentation's file sits in, below that root."),
        fullPath: z
          .string()
          .min(1)
          .optional()
          .describe("The file's absolute path on the instance's own filesystem."),
      })
      .check((ctx) => {
        const { partialPath, prSubDirectory, fullPath } = ctx.value;

        if (partialPath === undefined && prSubDirectory === undefined && fullPath === undefined) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: [],
            message: "a path naming nothing says nothing — omit the whole entry instead",
          });
        }
      })
      .describe(
        "Three spellings of one location, none of them required on its own: a producer publishes " +
          "whichever it holds, and at least one is present. Nothing on the backbone opens these " +
          "— actuation stops at the Present manager — so they are for launch coordination and " +
          "reconciliation inside the host's own implementation.",
      ),
  })
  .describe(
    "One presentation computer and the file it has open: an opaque instanceId plus the path " +
      "object. An instance with nothing open is reported by absence — from the pointer's files " +
      "array, or by omitting the singular file a command carries — never by an entry with an " +
      "empty path.",
  );

/**
 * The groups both domains carry, spread into a message so the message's own members lead and
 * the context follows:
 * `z.strictObject({ ...timerEnvelope(...), ...body, ...presentationContext() })`.
 *
 * `session` and `files` only. The `presentation` group is deliberately not here — it rides the
 * two presentation-domain messages that spell it out, and never the timer's events
 * (see {@link presentationGroup}).
 *
 * A function rather than a plain object only to read the way the two envelopes do at the same
 * call sites; Zod schemas are immutable, so sharing them across messages would be safe either
 * way.
 *
 * **Each group's documentation lives on the group's own schema, not here.** A `.describe()` on
 * the wrapping `.optional()` *replaces* the inner one on the way to JSON Schema, so a second
 * description here would silently be the only one reaching C# — and the invariants would not.
 */
export const presentationContext = () => ({
  session: sessionGroup.optional(),
  files: z
    .array(presentationFile)
    .min(1)
    .describe(
      "The presentation computers with a file open for this presentation, one entry each. " +
        "instanceId APPEARS ONCE ACROSS THE ARRAY — a further report from an instance already " +
        "present REPLACES that instance's entry rather than adding a second one. Only the files " +
        "repeat: the room is in one presentation, and these machines have files open for it. An " +
        "empty array is not a state — a room with nothing open omits the member, as does a " +
        "producer that publishes no paths.",
    )
    .optional(),
});

/** `instanceId`s appearing more than once in a `files` array, in first-seen order. */
export const duplicateInstanceIds = (
  files: readonly { readonly instanceId: string }[] | undefined,
): string[] => {
  if (files === undefined) {
    return [];
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const file of files) {
    if (seen.has(file.instanceId)) {
      duplicates.add(file.instanceId);
    }

    seen.add(file.instanceId);
  }

  return [...duplicates];
};
