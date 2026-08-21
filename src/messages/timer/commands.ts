import { z } from "zod";
import { timerCue, timerEnvelope } from "./common.ts";

/**
 * Timer commands — exchange `mtng.commands`, routing key `timer.<name>.<target>`.
 *
 * The generic primitives every driver reduces to: the presentation-driven path evaluates hints
 * and cues, then applies exactly these, so there is one command vocabulary rather than two.
 *
 * **One message type per command**, not a single discriminated `timer.command`. Each command is
 * then its own routing key, which is the authorization substrate — "this operator may write
 * `timer.add` but not `timer.clear`" is a topic permission, expressible only if the commands
 * are separate keys.
 *
 * `create` is **reserved** and deliberately not authored: the PresentationPhase timer is one
 * standing instance, and creation only becomes meaningful with operator-defined Custom timers.
 */

/**
 * `timer.set-to.<target>` — set the clock, and say whether it runs.
 *
 * Atomic on purpose: set-and-run and set-and-hold are one command, so no observer ever sees the
 * intermediate state. Re-anchors `startingValue`.
 */
export const TimerSetTo = z
  .strictObject({
    ...timerEnvelope("set-to", "command"),
    value: z.int().describe("The clock value to set, in signed whole seconds."),
    running: z.boolean().describe("true to start counting immediately, false to set and hold."),
  })
  .describe(
    "Set the clock, and say whether it runs. Atomic on purpose — set-and-run and set-and-hold " +
      "are one command, so no observer sees the intermediate state. Re-anchors startingValue.",
  );

export type TimerSetTo = z.infer<typeof TimerSetTo>;

/**
 * `timer.add.<target>` — give the speaker more time.
 *
 * Does **not** re-anchor `startingValue`, so cues keep firing against the basis they were
 * resolved for. Kept separate from `subtract` to match the operator's vocabulary.
 */
export const TimerAdd = z
  .strictObject({
    ...timerEnvelope("add", "command"),
    delta: z.int().describe("Seconds to add."),
  })
  .describe(
    "Give the speaker more time. Does not re-anchor startingValue, so cues keep firing against " +
      "the basis they were resolved for.",
  );

export type TimerAdd = z.infer<typeof TimerAdd>;

/** `timer.subtract.<target>` — take time away. The mirror of `add`, and likewise no re-anchor. */
export const TimerSubtract = z
  .strictObject({
    ...timerEnvelope("subtract", "command"),
    delta: z.int().describe("Seconds to subtract."),
  })
  .describe("Take time away. The mirror of add, and likewise does not re-anchor startingValue.");

export type TimerSubtract = z.infer<typeof TimerSubtract>;

/**
 * `timer.pause.<target>` — hold the clock where it is.
 *
 * Pause and resume are the sole toggle; there is no separate start/stop. Envelope only.
 */
export const TimerPause = z
  .strictObject({
    ...timerEnvelope("pause", "command"),
  })
  .describe(
    "Hold the clock where it is. Pause and resume are the sole toggle — there is no separate " +
      "start/stop.",
  );

export type TimerPause = z.infer<typeof TimerPause>;

/** `timer.resume.<target>` — run the held clock again. Envelope only. */
export const TimerResume = z
  .strictObject({
    ...timerEnvelope("resume", "command"),
  })
  .describe("Run the held clock again.");

export type TimerResume = z.infer<typeof TimerResume>;

/**
 * `timer.set-cues.<target>` — replace the cue set.
 *
 * Whole-set replacement, never a merge: an empty array clears every cue.
 */
export const TimerSetCues = z
  .strictObject({
    ...timerEnvelope("set-cues", "command"),
    cues: z.array(timerCue).describe("The new cue set, replacing whatever the timer held."),
  })
  .describe("Replace the cue set. Whole-set replacement, never a merge — an empty array clears it.");

export type TimerSetCues = z.infer<typeof TimerSetCues>;

/**
 * `timer.clear.<target>` — put the timer in its terminal `cleared` state.
 *
 * Retained rather than absent: the instance still exists and still broadcasts, and displays
 * decide for themselves what a cleared timer looks like. Envelope only.
 */
export const TimerClear = z
  .strictObject({
    ...timerEnvelope("clear", "command"),
  })
  .describe(
    "Put the timer in its terminal cleared state. Retained rather than absent — the instance " +
      "still exists and still broadcasts, and displays decide what a cleared timer looks like.",
  );

export type TimerClear = z.infer<typeof TimerClear>;
