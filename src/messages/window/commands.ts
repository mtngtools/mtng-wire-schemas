import { z } from "zod";
import {
  windowCommandEnvelope,
  windowManagerCommandEnvelope,
  windowManagerTargetedCommandEnvelope,
} from "./common.ts";
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

/**
 * `window.hide.<windowId>` — sugar for a patch of `{ visible: false }`.
 *
 * Addressed to the Windows State Manager, not the window: the Manager merges the patch into
 * stored desired state and re-emits the whole-config Set, which is the only message a window
 * acts on. One path to a window, changes durable by construction (mtngtools/mtng-dotnet-mono
 * MTWindows wire-messages.md).
 */
export const WindowHide = z
  .strictObject(windowManagerTargetedCommandEnvelope("hide"))
  .describe(
    "Hide a window: sugar for patching { visible: false } into its stored desired state. " +
      "The Manager re-emits the whole-config Set; the window itself never binds this key. " +
      "Hiding keeps every component mounted — no unmount, no state loss — which is what " +
      "makes window-swap a first-class alternative to slot swaps.",
  );

export type WindowHide = z.infer<typeof WindowHide>;

/**
 * `window.show.<windowId>` — sugar for a patch of `{ visible: true }`.
 *
 * The counterpart of `window.hide`; same Manager-bound patch mechanism.
 */
export const WindowShow = z
  .strictObject(windowManagerTargetedCommandEnvelope("show"))
  .describe(
    "Show a hidden window: sugar for patching { visible: true } into its stored desired " +
      "state. The Manager re-emits the whole-config Set; the window itself never binds this " +
      "key.",
  );

export type WindowShow = z.infer<typeof WindowShow>;

/**
 * `window.apply-state` — assert a named, hand-authored room state.
 *
 * The Manager capability from mtngtools/mtng-dotnet-mono ADR-0023. No target segment — the
 * message addresses the Manager, whose store is room-wide. The state's content never crosses
 * the wire; it is configuration. An unknown stateKey reports on `window.config-rejected`.
 */
export const WindowApplyState = z
  .strictObject({
    ...windowManagerCommandEnvelope("apply-state"),
    stateKey: z
      .string()
      .min(1)
      .describe(
        "Which named state to assert, from the Manager's hand-authored configuration. The " +
          "content of the state never crosses the wire; an unknown key reports on " +
          "window.config-rejected.",
      ),
  })
  .describe(
    "Assert a named, hand-authored room state — an assertion of desired state, never a " +
      "deletion. Addressed to the Windows State Manager; no target segment, the store is " +
      "room-wide.",
  );

export type WindowApplyState = z.infer<typeof WindowApplyState>;

/**
 * `window.clear` — sugar for `window.apply-state` with the configured ClearStateKey.
 *
 * The deliberate route back to a known state (ADR-0023): a room comes back showing whatever
 * it last showed, and this is the intentional act that changes that.
 */
export const WindowClear = z
  .strictObject(windowManagerCommandEnvelope("clear"))
  .describe(
    "Clear the room's windows to the configured clear state: sugar for window.apply-state " +
      "with the Manager's configured ClearStateKey. An assertion of a named, hand-authored " +
      "state, never a deletion — data loss must not be able to black out a live room; this " +
      "deliberate act is the way back to a known state.",
  );

export type WindowClear = z.infer<typeof WindowClear>;
