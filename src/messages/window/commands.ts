import { z } from "zod";
import {
  windowCommandEnvelope,
  windowManagerCommandEnvelope,
  windowManagerTargetedCommandEnvelope,
} from "./common.ts";
import {
  windowBounds,
  windowConfig,
  windowConfigPatch,
  windowPosition,
  windowSize,
} from "./config.ts";
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

/**
 * `window.set-window.<windowId>` — the complete window configuration.
 *
 * **Never a patch.** A patch has no fixed point and cannot be idempotently re-asserted, and
 * re-assertion is routine here: recovery replay, late-joiner pulls. Creation and
 * reconfiguration are the same message — the engine diffs against the current config and
 * applies only what changed, so a window is never recreated for a config change and never
 * loses the components it holds.
 *
 * **Bound by the Windows State Manager, not by a window** — even though the key names a
 * WindowId. Everything mutating desired state reaches the store first, so a window's state is
 * always exactly the store's; a client Setting a window directly would be a second path the
 * store knew nothing about, which is the live-versus-desired split this design exists to avoid.
 *
 * A malformed payload is not a rejection: JSON that fails to deserialize is logged and dropped
 * at the port. `window.config-rejected` covers the rules on configs that parse.
 */
export const WindowSetWindow = z
  .strictObject({
    ...windowManagerTargetedCommandEnvelope(
      "set-window",
      "The WindowId this command is about — the <target> routing segment. config.windowId is " +
        "the authoritative identity: a target naming anything else is rejected, untargeted, " +
        "because neither window can honestly own the report. Bound by the Windows State " +
        "Manager, never by a window.",
    ),
    config: windowConfig,
  })
  .describe(
    "Set a window's complete configuration, creating it if it does not exist. The engine " +
      "diffs against what is stored and applies only what changed, so re-asserting an " +
      "unchanged config is a no-op and a window is never recreated for a config change.",
  );

export type WindowSetWindow = z.infer<typeof WindowSetWindow>;

/**
 * `window.patch-window.<windowId>` — a sparse change to stored desired state.
 *
 * **For producers that do not hold the config.** The Manager merges the patch into stored
 * desired state and publishes the whole state document; a window only ever acts on that
 * document. One path to a window, changes durable by construction, no live-versus-desired
 * split.
 *
 * `window.hide` and `window.show` are pure sugar for this, each expanding to exactly one patch.
 */
export const WindowPatchWindow = z
  .strictObject({
    ...windowManagerTargetedCommandEnvelope("patch-window"),
    patch: windowConfigPatch,
  })
  .describe(
    "Change part of a window's stored desired state without holding its whole config. The " +
      "Manager merges this into the store and publishes the whole state document — a window " +
      "acts on that document and never on this message.",
  );

export type WindowPatchWindow = z.infer<typeof WindowPatchWindow>;

/**
 * `window.set-bounds.<windowId>` — the geometry fields alone, in the config object's spellings.
 *
 * Named sugar for a patch carrying nothing but geometry, so an operator surface that only ever
 * moves windows needs neither the whole config nor a general patch.
 *
 * **The Manager stores exactly the intent it is given and never infers one**: a body carrying
 * `position.display` plus offsets is stored display-anchored and re-resolves continuously; a
 * body carrying bare `{ pixels }` offsets and no display is stored OS-explicit *verbatim* —
 * resolving which display contains a rectangle would fabricate a plan the sender never stated,
 * correct today and invisibly wrong when the arrangement changes.
 */
export const WindowSetBounds = z
  .strictObject({
    ...windowManagerTargetedCommandEnvelope(
      "set-bounds",
      "The WindowId whose geometry this command sets — the <target> routing segment. " +
        "Required, like every patch: geometry with nobody to apply it to is meaningless. " +
        "Bound by the Windows State Manager, not by any window.",
    ),
    position: windowPosition.optional(),
    size: windowSize.optional(),
    bounds: windowBounds.optional(),
  })
  .describe(
    "Set a window's geometry — the position, size and composite fields of its configuration, " +
      "in the same spellings a complete config uses. A patch in all but name, so what is " +
      "absent is left as stored.",
  );

export type WindowSetBounds = z.infer<typeof WindowSetBounds>;

/**
 * `window.close.<windowId>` — destroy a window.
 *
 * **Explicit, because per-window deltas cannot say it by absence.** Runs the unmount contract
 * per slot, then destroys; always completes, since a wedged dispose is abandoned at the
 * timeout. A clean close publishes nothing, and closing the last window never exits the
 * process — a room with no windows is a room waiting for one.
 *
 * **The broadcast form is removed.** It previously existed as the untargeted key, which would
 * have closed every window in the room from one message; closing them all stays fully
 * expressible as N explicit commands, which is an operator's deliberate act rather than a
 * single slip.
 */
export const WindowClose = z
  .strictObject(
    windowManagerTargetedCommandEnvelope(
      "close",
      "The WindowId to close — the <target> routing segment. Required: there is no broadcast " +
        "form, so closing a room's windows is N deliberate commands rather than one. Bound by " +
        "the Windows State Manager, not by any window.",
    ),
  )
  .describe(
    "Close one window: run the unmount contract for each of its slots, then destroy it. " +
      "Always completes — a wedged dispose is abandoned at the timeout — and a clean close " +
      "publishes nothing. Never exits the process, whichever window it was.",
  );

export type WindowClose = z.infer<typeof WindowClose>;
