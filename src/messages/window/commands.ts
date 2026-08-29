import { z } from "zod";
import { windowCommandEnvelope } from "./common.ts";
import { WindowSlotContent } from "./content.ts";

/**
 * Window commands — exchange `mtng.commands`, routing key `window.<name>[.<windowId>]`.
 *
 * A window binds its own key plus the broadcast form. `slotId` is a body field, not a key
 * segment — a window binds per-window, not per-slot.
 */

/**
 * `window.set-slot-content[.<windowId>]` — declare a slot's desired content.
 *
 * **Declarative, not imperative**: the command states what the slot should hold; the engine
 * reconciles from whatever is there now. `set`, not `load`, because re-assertion is routine —
 * recovery-queue replay, late-joiner pulls — and an imperative verb would restart a running
 * component on every one. Identical desired content (structural equality on the deserialized
 * config, never string equality on raw JSON) is a no-op; any change recreates.
 */
export const WindowSetSlotContent = z
  .strictObject({
    ...windowCommandEnvelope("set-slot-content"),
    slotId: z
      .string()
      .min(1)
      .describe(
        "The slot this command addresses, within the window's layout. A body field, never a " +
          "routing segment. Only the single-slot Fill layout is specified today; naming the " +
          "slot regardless keeps multi-slot layouts additive rather than a wire reshape.",
      ),
    content: WindowSlotContent,
  })
  .describe(
    "Declare a slot's desired content; the receiving window reconciles from whatever is " +
      "there now. Identical desired content is a no-op — recovery replay and late-joiner " +
      "re-assertions restart nothing; a changed config or content type recreates the occupant.",
  );

export type WindowSetSlotContent = z.infer<typeof WindowSetSlotContent>;
