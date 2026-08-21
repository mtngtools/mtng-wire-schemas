import { z } from "zod";
import { timerClock, timerCue, timerCueFamily, timerEnvelope } from "./common.ts";

/**
 * Timer events — exchange `mtng.events`, routing key `timer.<name>.<target>`.
 */

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
  })
  .describe(
    "A full, self-contained snapshot of one timer instance, broadcast per transition rather " +
      "than per second: clients interpolate between anchors. The same shape answers the " +
      "current-state RPC, so a snapshot and a delta are applied by the same code.",
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
  })
  .describe(
    "A cue was crossed. A crossing is not a transition, so without this nothing would tell a " +
      "basic display that a cue fired between two anchors — it is the 'furthestCue advanced' push.",
  );

export type TimerCueFired = z.infer<typeof TimerCueFired>;
