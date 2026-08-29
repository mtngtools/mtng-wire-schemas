import { z } from "zod";
import { presentationEnvelope } from "./common.ts";

/**
 * Presentation RPC — exchange `mtng.rpc`, routing key `presentation.<name>`.
 */

/**
 * `presentation.current-state` — ask the room for its presentation pointer.
 *
 * The request only, and it is envelope-only: presentation state is room-singular, so there is
 * nothing to address and nothing to ask for. **The reply is a `PresentationStateChanged`**,
 * identical to what the broadcast carries, so a client applies a snapshot and a transition
 * with the same code — there is deliberately no separate reply schema.
 *
 * That is the connect protocol displays use everywhere: subscribe first, snapshot over RPC,
 * then replay what was buffered.
 */
export const PresentationCurrentState = z
  .strictObject({
    ...presentationEnvelope("current-state", "rpc"),
  })
  .describe(
    "Ask the room for its presentation pointer. Envelope-only — presentation state is " +
      "room-singular, so there is nothing to address. The reply is a PresentationStateChanged, " +
      "identical to the broadcast, so a snapshot and a transition are applied by the same code.",
  );

export type PresentationCurrentState = z.infer<typeof PresentationCurrentState>;
