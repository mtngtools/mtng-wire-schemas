import { z } from "zod";
import { roomComputersEnvelope } from "./common.ts";

/**
 * Room-computers RPC — exchange `mtng.rpc`, routing key `room-computers.<name>`.
 */

/**
 * `room-computers.current-state` — ask the room for its computers.
 *
 * The request only, and it is envelope-only: the room's computers are room-singular, so there is
 * nothing to address and nothing to ask for. **The reply is a `RoomComputersStateChanged`**,
 * identical to what the broadcast carries — the timer and presentation pair — so there is
 * deliberately no separate reply schema.
 */
export const RoomComputersCurrentState = z
  .strictObject({
    ...roomComputersEnvelope("current-state", "rpc"),
  })
  .describe(
    "Ask the room for its computers. Envelope-only — the room's computers are room-singular, " +
      "so there is nothing to address. The reply is a RoomComputersStateChanged, identical to " +
      "the broadcast.",
  );

export type RoomComputersCurrentState = z.infer<typeof RoomComputersCurrentState>;
