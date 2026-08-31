import { z } from "zod";
import { blockGroup, presentationFile, sessionGroup, timerGroup } from "../../shared/presentation-context.ts";
import { addressedInstance, presentationEnvelope } from "./common.ts";

/**
 * Presentation commands — exchange `mtng.commands`, routing key `presentation.<name>`.
 *
 * **No `<target>` segment.** These address the Manager, and actuation stops there
 * (mtngtools/mtng-dotnet-mono#375): the Manager hands the command to its driver, and how the
 * driver reaches the presentation software is unspecified. So the instance a navigation reaches
 * is a body member, not a routing segment.
 *
 * **One message type per command**, not a single discriminated `presentation.command` — the
 * timer's reason, unchanged. Each command is then its own routing key, which is the authorization
 * substrate: "this operator may send `goto-next-slide` but not `exit`" is a topic permission,
 * expressible only if the commands are separate keys. That is why there are four `goto-*` keys
 * rather than one command with a direction field, and why the echo they share is nevertheless a
 * single event (`presentation.slide-navigated`) — the split is a write-side concern.
 *
 * **Only navigation has an echo.** `enter` and `exit` change the state, so the resulting
 * `presentation.state-changed` *is* their acknowledgement (mtngtools/mtng-dotnet-mono#379).
 * Navigation gets one precisely because it changes nothing: there is no slide in this model.
 */

/**
 * `presentation.enter` — the room is now in this presentation.
 *
 * **An imperative that asserts a state, not a past-tense report.** A report-only driver reads it
 * as *record what already happened*; a driving driver reads it as *open that file*. One command
 * covers native and third-party rooms rather than forking into an `open` imperative and an
 * `opened` report — the move [`timer.set-to`](../timer/commands.ts) already makes.
 *
 * Carries the pointer's own identity members plus the same `SelfContained` groups, with a
 * **singular `file`** where the pointer carries the `files` array: a command comes from and
 * addresses one instance, and only the room's *state* aggregates across them
 * (mtngtools/mtng-dotnet-mono#379).
 *
 * **`enteredAt` is deliberately absent.** Minting it is the Manager shell's obligation — on every
 * transition, and restored rather than re-minted across its own restart — so a client cannot
 * supply it and cannot break the equality key by trying.
 */
export const PresentationEnter = z
  .strictObject({
    ...presentationEnvelope("enter", "command"),
    presentationId: z
      .string()
      .min(1)
      .describe(
        "Opaque id of the presentation the room is entering. MATCHED BYTE-WISE, NEVER PARSED, " +
          "as on the pointer. Required: a command asserting the room is in THIS presentation " +
          "without naming it says nothing, and the pointer it produces carries presentationId " +
          "whenever phase is not 'none'.",
      ),
    phase: z
      .enum(["intro", "talk", "qa"])
      .optional()
      .describe(
        "Which phase the room is entering. NO 'none' ARM: leaving is presentation.exit, not an " +
          "enter that asserts absence. Optional because the manager's documented DEFAULT-TO-TALK " +
          "covers absence — it stamps 'talk' whenever the phase is not explicitly 'intro' or " +
          "'qa', and an authored 'talk' and a defaulted one are indistinguishable on the wire.",
      ),
    actualPrStart: z
      .iso
      .datetime()
      .optional()
      .describe(
        "When the BLOCK actually started, ISO-8601 UTC — supplied when the producer already " +
          "knows it, which is the third-party case: software that opened the presentation " +
          "before it ever connected to the room. Absent leaves the manager to stamp it at " +
          "phase-begin. Not enteredAt, which is the manager's alone.",
      ),
    block: blockGroup.optional(),
    session: sessionGroup.optional(),
    timer: timerGroup.optional(),
    // Spread bare, with no wrapping .describe(): one here would REPLACE presentationFile's own,
    // silently shipping this site's words in place of the shape's. The singular-versus-array
    // reasoning is on the message instead, which is what it is about.
    file: presentationFile.optional(),
  })
  .describe(
    "The room is now in this presentation. An imperative that asserts a state, not a past-tense " +
      "report: a report-only driver records it, a driving driver opens the file, and one command " +
      "covers both rooms. Carries presentationId always, the phase when it is not the defaulted " +
      "'talk', and the SelfContained groups a producer holds. THE FILE IS SINGULAR where the " +
      "pointer carries a files array: a command comes from and addresses one instance, and only " +
      "the room's state aggregates across them; a reporter with no file open — a live panel — " +
      "omits it. enteredAt is the manager's to mint and never rides the command. Acknowledged by " +
      "the resulting presentation.state-changed, not by an echo of its own.",
  );

export type PresentationEnter = z.infer<typeof PresentationEnter>;

/**
 * `presentation.exit` — leave the presentation; takes `phase` to `none`.
 *
 * Envelope-only. `phase: none` is the absence of a presentation and is room-wide: it carries no
 * `presentationId`, no `actualPrStart` and none of the four groups, so there is nothing for the
 * command to say beyond its own name. Not per-instance for the same reason — an instance closing
 * its file is a report that changes the `files` array, not an exit from the presentation.
 *
 * Acknowledged by the resulting `presentation.state-changed`, like `enter`.
 */
export const PresentationExit = z
  .strictObject({
    ...presentationEnvelope("exit", "command"),
  })
  .describe(
    "Leave the presentation — takes phase to 'none'. Envelope-only: 'none' is room-wide and " +
      "carries no presentationId, no actualPrStart and none of the four groups, so there is " +
      "nothing to say beyond the name. Acknowledged by the resulting presentation.state-changed.",
  );

export type PresentationExit = z.infer<typeof PresentationExit>;

/**
 * `presentation.goto-next-slide` — move the presentation forward one slide.
 *
 * The four `goto-*` commands are identical in shape and differ only in their routing key, which
 * is the whole point: the key is the authorization subject. Each is acknowledged by
 * `presentation.slide-navigated`, whose `navigation` member says which one fired.
 */
export const PresentationGotoNextSlide = z
  .strictObject({
    ...presentationEnvelope("goto-next-slide", "command"),
    ...addressedInstance(),
  })
  .describe(
    "Move the presentation forward one slide. Its own routing key rather than a direction field " +
      "on a shared command, because the key is the authorization subject. Echoed by " +
      "presentation.slide-navigated with navigation 'next'.",
  );

export type PresentationGotoNextSlide = z.infer<typeof PresentationGotoNextSlide>;

/** `presentation.goto-previous-slide` — move the presentation back one slide. */
export const PresentationGotoPreviousSlide = z
  .strictObject({
    ...presentationEnvelope("goto-previous-slide", "command"),
    ...addressedInstance(),
  })
  .describe(
    "Move the presentation back one slide. Echoed by presentation.slide-navigated with " +
      "navigation 'previous'.",
  );

export type PresentationGotoPreviousSlide = z.infer<typeof PresentationGotoPreviousSlide>;

/** `presentation.goto-first-slide` — jump the presentation to its first slide. */
export const PresentationGotoFirstSlide = z
  .strictObject({
    ...presentationEnvelope("goto-first-slide", "command"),
    ...addressedInstance(),
  })
  .describe(
    "Jump the presentation to its first slide. Echoed by presentation.slide-navigated with " +
      "navigation 'first'.",
  );

export type PresentationGotoFirstSlide = z.infer<typeof PresentationGotoFirstSlide>;

/** `presentation.goto-last-slide` — jump the presentation to its last slide. */
export const PresentationGotoLastSlide = z
  .strictObject({
    ...presentationEnvelope("goto-last-slide", "command"),
    ...addressedInstance(),
  })
  .describe(
    "Jump the presentation to its last slide. Echoed by presentation.slide-navigated with " +
      "navigation 'last'.",
  );

export type PresentationGotoLastSlide = z.infer<typeof PresentationGotoLastSlide>;
