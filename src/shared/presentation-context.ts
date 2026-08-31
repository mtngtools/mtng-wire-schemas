import { z } from "zod";
import { load, phaseCue, timerHint } from "./timing.ts";

/**
 * The `SelfContained` dialect's four optional groups, shared by the `presentation` and `timer`
 * domains (ADR-0024; mtngtools/mtng-dotnet-mono#372, #378, #379, #380).
 *
 * A `SelfContained` room has **no Meeting data manager**, so `presentationId` on any message
 * points at nothing a consumer can resolve. Either the context rides along or it is unreachable —
 * the join target does not exist. These groups are that context, and they ride
 * `presentation.state-changed`, `timer.state-changed` and `timer.cue-fired` alike.
 *
 * In a `Linked` room every one of them is **absent**: there the join target does exist, and
 * fattening these messages would put a second copy of the Meeting data manager's data on the
 * highest-frequency traffic on the bus.
 *
 * **Each group is independently optional; within a group its required members are required.** Not
 * all-or-nothing, because real producers have partial knowledge — a live panel with no file has
 * no `files`, a presentation with no cues authored is ordinary, a producer may not model sessions
 * at all. Not a flat bag either: ~11 optional members would carry no invariants, leaving every
 * consumer its own defensive join.
 *
 * **An empty group is not a third state.** A group whose members are all absent says exactly what
 * absence of the group says, so each `.check()` below rejects it — a producer with nothing to say
 * omits the group. `oneOf` does not survive the C# mirror, so every invariant here rides a
 * `.check()` and the mirror carries structure only, exactly as the pointer's own body invariant
 * does.
 *
 * Field prefixes are the upstream glossary's: `ss*` session, `pr*` presentation.
 */

/**
 * The presentation block: what is up now and the window it occupies.
 *
 * Two audiences with different needs — displays want `prTitle`, which in a `SelfContained` room
 * there is nothing to join for; the timer wants the window, because a `percent` hint threshold is
 * of `prEnd - prStart`. A producer may hold either without the other, so no member is
 * unconditionally required; an end without a start is what says nothing.
 */
export const blockGroup = z
  .strictObject({
    prTitle: z
      .string()
      .min(1)
      .optional()
      .describe("The presentation's title, for displays that have nothing to join against."),
    prStart: z
      .iso
      .datetime()
      .optional()
      .describe(
        "The block's SCHEDULED start, ISO-8601 UTC. Not actualPrStart, which is the live fact " +
          "and sits on the message's always-present core.",
      ),
    prEnd: z
      .iso
      .datetime()
      .optional()
      .describe(
        "The block's SCHEDULED end, ISO-8601 UTC. With prStart it is the block window a " +
          "percent-unit timer hint threshold is a percentage of.",
      ),
  })
  .check((ctx) => {
    const { prTitle, prStart, prEnd } = ctx.value;

    if (prTitle === undefined && prStart === undefined && prEnd === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [],
        message: "an empty block group says what absence says — omit it",
      });
    }

    if (prEnd !== undefined && prStart === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["prStart"],
        message: "prEnd carries prStart — a window's end says nothing without its start",
      });
    }
  })
  .describe(
    "SelfContained only: the presentation block — its title for displays, and its scheduled " +
      "window for the timer's block-relative math. Absent in a Linked room, where the Meeting " +
      "data manager holds it. Every member is optional and at least one is present; prEnd " +
      "carries prStart.",
  );

/**
 * The session containing the block.
 *
 * Wholly optional as a group: a third-party producer may not model sessions at all, and a room
 * that never shows session context loses nothing by its absence.
 */
export const sessionGroup = z
  .strictObject({
    ssId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Opaque id of the session. MATCHED BYTE-WISE, NEVER PARSED, like presentationId: no " +
          "structure is promised and equality is the only operation defined on it.",
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
    "SelfContained only: the session containing the block. Absent in a Linked room, where the " +
      "Meeting data manager holds it. Every member is optional and at least one is present; " +
      "ssEnd carries ssStart.",
  );

/**
 * What the producer already resolved for the timer — the one group with a single audience.
 *
 * In a `Linked` room the Timer manager runs the Resolved tier itself, walking the per-(phase,
 * prop) ladder over the schedule and the library. A `SelfContained` producer ran it upstream, so
 * these are inline values rather than refs — and **refs are not valid anywhere in this group**,
 * including a preset that would have carried `load`.
 *
 * **Only the Resolved tier moves.** The **Runtime** tier stays the Timer manager's in both
 * dialects, because only it is time-dependent: these members are still symbolic, and the timer
 * reduces them against live signals and the clock at phase load
 * (mtngtools/mtng-dotnet-mono#382).
 *
 * The three arrive independently: a presentation with no cues authored is ordinary, hints are
 * rarer still, and a producer saying nothing about `load` leaves the Timer manager's own rungs —
 * host `phaseLoading`, then the `ignore` floor — to answer.
 */
export const timerGroup = z
  .strictObject({
    phaseCues: z
      .array(phaseCue)
      .optional()
      .describe(
        "The phase's cue set as AUTHORED, in phaseCue's symbolic form — refs already " +
          "dereferenced and any preset applied, but thresholds not reduced. The Timer manager " +
          "reduces them to concrete clock values at phase load, because a percent threshold " +
          "measures against a starting timer value that is not fixed until the phase starts. " +
          "Deliberately NOT the reduced timerCue the timer broadcasts on timer.state-changed.",
      ),
    timerHints: z
      .array(timerHint)
      .optional()
      .describe(
        "The resolved hint set for the phase, in authored order — later qualifying entries win " +
          "over earlier ones for the same bound.",
      ),
    load: load.optional(),
  })
  .check((ctx) => {
    const { phaseCues, timerHints, load: loadValue } = ctx.value;

    if (phaseCues === undefined && timerHints === undefined && loadValue === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: [],
        message: "an empty timer group says what absence says — omit it",
      });
    }
  })
  .describe(
    "SelfContained only: what the producer ran the Resolved tier over for the timer — the " +
      "phase's authored cue set, its hint set, and its load directive, inline and ref-free. " +
      "Timer manager only. Still symbolic: the timer runs the Runtime tier over them in both " +
      "dialects. Absent in a Linked room, where the Timer manager runs the Resolved tier too. " +
      "Every member is optional and at least one is present.",
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
          "MATCHED BYTE-WISE, NEVER PARSED, like presentationId, and loose on purpose: it exists " +
          "so a producer can reconcile with itself, not so anything routes on it. It is the " +
          "files array's uniqueness key.",
      ),
    path: z
      .strictObject({
        partialPath: z
          .string()
          .min(1)
          .optional()
          .describe("The file's path relative to the producer's own presentation root."),
        presentationSubDirectory: z
          .string()
          .min(1)
          .optional()
          .describe("The sub-directory the file sits in, below that root."),
        fullPath: z
          .string()
          .min(1)
          .optional()
          .describe("The file's absolute path on the instance's own filesystem."),
      })
      .check((ctx) => {
        const { partialPath, presentationSubDirectory, fullPath } = ctx.value;

        if (
          partialPath === undefined &&
          presentationSubDirectory === undefined &&
          fullPath === undefined
        ) {
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
 * The four groups, spread into a message so the message's own members lead and the dialect's
 * additions follow:
 * `z.strictObject({ ...presentationEnvelope(...), ...body, ...presentationContext() })`.
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
  block: blockGroup.optional(),
  session: sessionGroup.optional(),
  timer: timerGroup.optional(),
  files: z
    .array(presentationFile)
    .min(1)
    .describe(
      "SelfContained only: the presentation computers with a file open for this presentation, " +
        "one entry each. Absent in a Linked room. instanceId APPEARS ONCE ACROSS THE ARRAY — a " +
        "further report from an instance already present REPLACES that instance's entry rather " +
        "than adding a second one. Only the files repeat: the room is in one presentation, and " +
        "these machines have files open for it. An empty array is not a state — a room with " +
        "nothing open omits the member.",
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
