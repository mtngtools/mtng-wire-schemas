import { z } from "zod";
import {
  duplicateInstanceIds,
  presentationContext,
} from "../../shared/presentation-context.ts";
import { timerCue } from "../../shared/timing.ts";
import { timerClock, timerCueFamily, timerEnvelope } from "./common.ts";

/**
 * Timer events — exchange `mtng.events`, routing key `timer.<name>.<target>`.
 *
 * **Both events carry the key of what they time — `prId` and `phase` — in both dialects, and in a
 * `SelfContained` room the presentation domain's `session` and `files` groups besides**
 * (mtngtools/mtng-dotnet-mono#378, #720; ADR-0033). Before the key, neither event named its
 * presentation or its phase — `label` is
 * a display string — so a consumer holding only timer events could not say what the clock
 * belonged to: could not join a `Linked` event against the Meeting data manager, nor a
 * `SelfContained` one against a store keyed by `prId`. Two scalars fix that in both rooms.
 *
 * **Not the `presentation` group.** A title is the pointer's job — `label` was already thin by
 * design, with displays needing presentation context told to subscribe to the Present manager —
 * and presentation state is room-singular, so the current `presentation.state-changed` *is* the
 * join, no id needed. Carrying the group would also put the authored `phaseCues` beside the
 * reduced `cues` on one message, the same-name collision `phaseCues` exists to avoid.
 *
 * **Why `session` and `files` ride only in `SelfContained`.** A `SelfContained` room has no
 * Meeting data manager, so session context is unreachable unless it rides along; in a `Linked`
 * room the join target exists, and fattening the highest-frequency message on the bus with a
 * second copy of its data is the single-source rule's exact prohibition. The schema cannot see
 * the dialect — the rule is the Timer manager's, the one producer of these events — so the
 * groups are optional here and the manager omits them in `Linked`.
 *
 * **Both events, not only `cue-fired`.** Carrying context on the occasional message and leaving
 * the frequent `state-changed` thin would leave a display watching only `state-changed` with
 * nothing to join against — fixing the frequency cost by reintroducing the problem for half of
 * consumers.
 */

/**
 * The key of what a timer times, spread into both events after their own members:
 * `z.strictObject({ ...timerEnvelope(...), ...body, ...presentationKey(), ...presentationContext() })`.
 *
 * Optional and paired: a cleared timer, or one an operator drives directly, has no presentation
 * to name, and a phase without a presentation is meaningless — so both ride or neither does,
 * enforced by {@link checkPresentationKey} on each message.
 */
// TEMPORARY AGENT DECISION APPROVAL, IF THIS IS FOUND IN PR REVIEW FLAG AS PROBLEM
// prId and phase optional and paired (both or neither) over required on every timer event — the spec fixes that both events carry the key in both dialects and says nothing about a timer with no presentation, and a cleared or operator-driven timer has none to name
const presentationKey = () => ({
  prId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Opaque id of the presentation this timer is timing — MATCHED BYTE-WISE, NEVER PARSED — " +
        "the key a consumer joins on: against the Meeting data manager's broadcast in a Linked " +
        "room, against its own per-prId store in a SelfContained one. Present with phase " +
        "whenever a presentation drives the timer, in either dialect; absent on a cleared or " +
        "directly-driven one. The presentation group itself never rides a timer event — the " +
        "current presentation.state-changed is the join.",
    ),
  phase: z
    .enum(["intro", "talk", "qa"])
    .optional()
    .describe(
      "Which phase of that presentation the timer is timing. Present iff prId is — the two are " +
        "the key together. No 'none' arm: a timer timing no presentation omits both.",
    ),
});

/** The pairing invariant behind {@link presentationKey}: `prId` and `phase` ride together or not at all. */
const checkPresentationKey = (ctx: z.core.ParsePayload<{ prId?: string; phase?: string }>) => {
  const { prId, phase } = ctx.value;

  if (prId !== undefined && phase === undefined) {
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      path: ["phase"],
      message: "prId carries phase — the key is the pair",
    });
  }

  if (phase !== undefined && prId === undefined) {
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      path: ["prId"],
      message: "phase carries prId — the key is the pair",
    });
  }
};

/**
 * `timer.state-changed.<target>` — the spine message.
 *
 * A full, self-contained snapshot of one timer instance, emitted **per transition** rather than
 * per second: clients interpolate between anchors. Because it is a snapshot and not a delta, a
 * replayed broadcast and an RPC reply are the same shape applied by the same code — which is
 * why `timer.current-state` replies with this very message.
 *
 * One message serves both consumer tiers. A **basic** display interpolates `clock` against `ts`
 * and colours off the single `furthestCueFamily` scalar; a **smart** display self-evaluates the
 * descending-crossing predicate from `cues` and `startingValue`, treating `firedCues` and the
 * exact `furthestCue` label as confirmation.
 */
export const TimerStateChanged = z
  .strictObject({
    ...timerEnvelope("state-changed", "event"),
    timerKind: z
      .enum(["presentation-phase"])
      .describe(
        "Which kind of timer this instance is. Named timerKind rather than kind because the " +
          "envelope already owns 'kind' for the message kind, and the backbone port reads that " +
          "field by name to pick an exchange. One value today; Session, Presentation-block and " +
          "Custom are additive.",
      ),
    clock: timerClock,
    startingValue: z
      .int()
      .describe(
        "The clock value this run started from, in signed whole seconds. Frozen at load and " +
          "re-anchored only by set-to or a restart — never by add or subtract, so a smart " +
          "display can evaluate cues against a stable basis.",
      ),
    cues: z.array(timerCue).describe("The frozen cue set for this run — the smart-display basis."),
    firedCues: z
      .array(z.string().min(1))
      .describe("Labels of the cues crossed so far. Un-fires when the clock moves back past one."),
    furthestCue: z
      .string()
      .min(1)
      .describe(
        "Label of the fired cue furthest along the countdown, or 'none' if none has fired. A " +
          "lossless summary of firedCues, since cues sit on one descending clock and the fired " +
          "set is always a contiguous prefix. Recedes to 'none' when the clock moves back.",
      ),
    furthestCueFamily: timerCueFamily.describe(
      "The family of the furthest fired cue whose label names one — the closed vocabulary a " +
        "dumb display switches on, so its whole protocol is 'read the clock, switch on one " +
        "field'. A cue in no family (a custom 'coffee' cue) advances furthestCue but leaves " +
        "this holding whatever the last cue in a family set, so it can never flip a warned " +
        "display back to normal.",
    ),
    label: z
      .string()
      .optional()
      .describe(
        "What the timer is counting, e.g. the presentation phase's label. Thin by design — " +
          "displays needing presentation context subscribe to the Present manager, not to the " +
          "timer. Absent on a cleared or directly-driven timer.",
      ),
    ...presentationKey(),
    ...presentationContext(),
  })
  .check((ctx) => {
    checkPresentationKey(ctx);

    for (const duplicate of duplicateInstanceIds(ctx.value.files)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["files"],
        message: `instanceId '${duplicate}' appears more than once — one entry per instance`,
      });
    }
  })
  .describe(
    "A full, self-contained snapshot of one timer instance, broadcast per transition rather " +
      "than per second: clients interpolate between anchors. The same shape answers the " +
      "current-state RPC, so a snapshot and a delta are applied by the same code. Carries the " +
      "key of what it times — prId and phase, together or not at all — in either dialect, and " +
      "in a SelfContained room the presentation domain's session and files groups besides; " +
      "never the presentation group.",
  );

export type TimerStateChanged = z.infer<typeof TimerStateChanged>;

/**
 * `timer.cue-fired.<target>` — a cue was crossed.
 *
 * A crossing is not a transition — the clock simply runs on — so without this nothing would
 * tell a basic display that a cue fired between two anchors. It is exactly the "`furthestCue`
 * advanced" forward push.
 *
 * There is no un-fire event: moving the clock back always takes a command, and that command's
 * `state-changed` already re-sends `firedCues` and `furthestCue`.
 */
export const TimerCueFired = z
  .strictObject({
    ...timerEnvelope("cue-fired", "event"),
    label: z
      .string()
      .min(1)
      .describe("The cue that fired, matching its label in the timer's cue set."),
    ...presentationKey(),
    ...presentationContext(),
  })
  .check((ctx) => {
    checkPresentationKey(ctx);

    for (const duplicate of duplicateInstanceIds(ctx.value.files)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["files"],
        message: `instanceId '${duplicate}' appears more than once — one entry per instance`,
      });
    }
  })
  .describe(
    "A cue was crossed. A crossing is not a transition, so without this nothing would tell a " +
      "basic display that a cue fired between two anchors — it is the 'furthestCue advanced' " +
      "push. Carries the key of what it times — prId and phase, together or not at all — in " +
      "either dialect, and in a SelfContained room the session and files groups besides, for " +
      "the reason state-changed does.",
  );

export type TimerCueFired = z.infer<typeof TimerCueFired>;
