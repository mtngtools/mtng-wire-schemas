import { z } from "zod";
import { timerEnvelope } from "./common.ts";

/**
 * Timer RPC — exchange `mtng.rpc`, routing key `timer.<name>.<target>`.
 */

/**
 * `timer.current-state.<target>` — ask one timer for its snapshot.
 *
 * The request only; the **reply is a `TimerStateChanged`**, identical to what the broadcast
 * carries, so a client applies a snapshot and a delta with the same code. That is the connect
 * protocol: subscribe first, snapshot over RPC, then replay what was buffered.
 *
 * `target` is required and the granularity is one timer, matching the subscription — a display
 * binds `timer.state-changed.<target>` and snapshots `timer.current-state.<target>`, never
 * diffing a bundle to find its own element.
 */
export const TimerCurrentState = z
  .strictObject({
    ...timerEnvelope("current-state", "rpc"),
  })
  .describe(
    "Ask one timer for its snapshot. The request only — the reply is a TimerStateChanged, " +
      "identical to the broadcast, so a snapshot and a delta are applied by the same code.",
  );

export type TimerCurrentState = z.infer<typeof TimerCurrentState>;
