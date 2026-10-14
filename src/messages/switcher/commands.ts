import { z } from "zod";
import { switcherEnvelope, switcherMe, switcherSourceId } from "./common.ts";

/**
 * Switcher commands — exchange `mtng.commands`, routing key `switcher.<name>.<target>`.
 *
 * **One message type per command**, each its own routing key and so its own permissions rule
 * (mtng-dotnet-mono ADR-0010).
 *
 * **Each is answered by a basic state, with no reply message**: the switcher's report, or a
 * republish of the current `switcher.state-changed` within 500 ms. A command dropped — the link
 * down, an unknown `me` or an unknown `source` — is answered the same way. There is no refusal
 * event, and a command is never queued.
 */

/** `switcher.set-preview.<target>` — put a source on an M/E's preview bus. */
export const SwitcherSetPreview = z
  .strictObject({
    ...switcherEnvelope("set-preview", "command"),
    me: switcherMe,
    source: switcherSourceId("The source to put on preview"),
  })
  .describe(
    "Put a source on an M/E's preview bus. Answered by the next basic state; never queued.",
  );

export type SwitcherSetPreview = z.infer<typeof SwitcherSetPreview>;

/** `switcher.set-program.<target>` — put a source on an M/E's program bus. */
export const SwitcherSetProgram = z
  .strictObject({
    ...switcherEnvelope("set-program", "command"),
    me: switcherMe,
    source: switcherSourceId("The source to put on program"),
  })
  .describe(
    "Put a source on an M/E's program bus. Answered by the next basic state; never queued.",
  );

export type SwitcherSetProgram = z.infer<typeof SwitcherSetProgram>;

/** `switcher.cut.<target>` — cut an M/E: preview to program at once. */
export const SwitcherCut = z
  .strictObject({
    ...switcherEnvelope("cut", "command"),
    me: switcherMe,
  })
  .describe("Cut an M/E. Answered by the next basic state; never queued.");

export type SwitcherCut = z.infer<typeof SwitcherCut>;

/** `switcher.auto.<target>` — run an M/E's transition. */
export const SwitcherAuto = z
  .strictObject({
    ...switcherEnvelope("auto", "command"),
    me: switcherMe,
  })
  .describe("Run an M/E's transition. Answered by the next basic state; never queued.");

export type SwitcherAuto = z.infer<typeof SwitcherAuto>;
