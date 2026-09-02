import { z } from "zod";
import { windowManagerRpcEnvelope } from "./common.ts";

/**
 * Window RPC — exchange `mtng.rpc`, routing key `window.<name>`.
 *
 * One request, and it names no window: the Manager's store is room-wide, and what comes back
 * is the whole collection rather than one window's slice.
 */

/**
 * `window.request-windows-state` — pull current desired state from the Windows State Manager.
 *
 * The request only; the **reply is a `WindowDesiredStateChanged`**, identical to what the
 * Manager broadcasts whenever its store changes, so a client applies a snapshot and a live
 * change with the same code. That is the connect protocol — subscribe first, snapshot over RPC,
 * then replay what was buffered — and it is what makes boot and live operation one path rather
 * than two. `TimerCurrentState` answers with a `TimerStateChanged` for the same reason.
 *
 * **The snapshot owns the whole collection and is authoritative over it.** Windows, slot
 * contents and the room's static content presets travel together, which is how boot lands them
 * at once and how a stale window nobody remembers gets reaped.
 *
 * **An empty reply means the rung has not arrived**, never "close everything": a Manager that
 * lost its storage must not be able to black out a live room, so a startup ladder holding an
 * empty answer stays where it is. Closing a room's windows remains fully expressible as N
 * explicit `window.close` commands — an operator's deliberate act.
 */
export const WindowRequestWindowsState = z
  .strictObject({
    ...windowManagerRpcEnvelope("request-windows-state"),
  })
  .describe(
    "Ask the Windows State Manager for the room's desired state. The request only — the " +
      "reply is a WindowDesiredStateChanged, identical to the broadcast, so boot and live " +
      "operation apply the same document through the same code. No target: the store is " +
      "room-wide and the reply owns the whole collection.",
  );

export type WindowRequestWindowsState = z.infer<typeof WindowRequestWindowsState>;
