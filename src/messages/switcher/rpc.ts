import { z } from "zod";
import { switcherEnvelope } from "./common.ts";

/**
 * Switcher RPC — exchange `mtng.rpc`, routing key `switcher.<name>.<target>`.
 *
 * Envelope-only requests, one per document, each answered with the last published document of
 * its kind and none before that document's first publish. **The reply is the document itself**,
 * identical to what the broadcast carries — the timer pair — so there is deliberately no
 * separate reply schema, and a client applies a reply and a broadcast with the same code.
 */

/** `switcher.current-state.<target>` — ask for the basic state; the reply is a `SwitcherStateChanged`. */
export const SwitcherCurrentState = z
  .strictObject({
    ...switcherEnvelope("current-state", "rpc"),
  })
  .describe(
    "Ask one switcher for its basic state. Envelope-only — the reply is a SwitcherStateChanged, " +
      "identical to the broadcast.",
  );

export type SwitcherCurrentState = z.infer<typeof SwitcherCurrentState>;

/** `switcher.current-details.<target>` — ask for the advanced state; the reply is a `SwitcherDetailsChanged`. */
export const SwitcherCurrentDetails = z
  .strictObject({
    ...switcherEnvelope("current-details", "rpc"),
  })
  .describe(
    "Ask one switcher for its advanced state. Envelope-only — the reply is a " +
      "SwitcherDetailsChanged, identical to the broadcast.",
  );

export type SwitcherCurrentDetails = z.infer<typeof SwitcherCurrentDetails>;

/** `switcher.current-tally.<target>` — ask for the tally; the reply is a `SwitcherTallyChanged`. */
export const SwitcherCurrentTally = z
  .strictObject({
    ...switcherEnvelope("current-tally", "rpc"),
  })
  .describe(
    "Ask one switcher for its tally. Envelope-only — the reply is a SwitcherTallyChanged, " +
      "identical to the broadcast.",
  );

export type SwitcherCurrentTally = z.infer<typeof SwitcherCurrentTally>;
