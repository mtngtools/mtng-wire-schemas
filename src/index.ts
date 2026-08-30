/**
 * The dual-language ALLOW-LIST.
 *
 * A message crosses the TS <-> .NET boundary *only* if it is re-exported here.
 * Anything not exported from this barrel is single-language by default. Keep this
 * surface small and intentional (ADR-0005).
 *
 * Every export must be a Zod schema whose name is PascalCase: `npm run generate` emits one
 * `schemas/<kebab-case>.schema.json` per export, and that export name becomes the C# class name
 * on the .NET side.
 */
// backdrop domain — the floor app's message set, all five dual-language (ADR-0005): the only
// plausible senders are TS-side, and a commands-dual/events-single split would let a console
// send hide but not read the backdrop.hidden that reports the clamp.
export { BackdropHide, BackdropShow } from "./messages/backdrop/commands.ts";
export {
  BackdropAssetUnresolved,
  BackdropHidden,
  BackdropShown,
} from "./messages/backdrop/events.ts";

// window domain — the slot-content trio (mtngtools/mtng-dotnet-mono#312): web components
// connect directly over WebSockets, which is what makes these genuinely cross-language.
// WindowSlotContent is the closed content union — not itself a message, exported so the TS
// side narrows on the same schema the command embeds.
export { WindowSetSlotContent } from "./messages/window/commands.ts";
export { WindowSlotContent } from "./messages/window/content.ts";
export { WindowSlotContentFailed } from "./messages/window/events.ts";

// window domain — the configuration surface's dual-language slice, ruled per message by
// mtngtools/mtng-dotnet-mono#315 (MTWindows wire-messages.md §Dual-language surface): the
// sugar verbs, the named-state pair, and the rejection report cross here. The config-carrying
// messages (set-window, patch-window, set-bounds) are ruled single-language: their geometry
// fields are shape-discriminated unions this generator cannot mirror (no oneOf/anyOf survives
// to C#), so their one spelling lives hand-authored on the .NET side — revisitable if the
// mirror ever learns unions.
export {
  WindowApplyState,
  WindowClear,
  WindowHide,
  WindowShow,
} from "./messages/window/commands.ts";
export { WindowConfigRejected } from "./messages/window/events.ts";

// window domain — the static content paint path's one report (mtngtools/mtng-dotnet-mono#319),
// dual for the reason config-rejected is: an operator-facing report of two plain fields, and
// the identical backdrop message (BackdropAssetUnresolved) already crosses. Both hosts of the
// static-content library therefore speak the same reason vocabulary on the wire.
export { WindowAssetUnresolved } from "./messages/window/events.ts";

// presentation domain — the Present manager's pointer and its snapshot RPC, both dual-language
// (mtngtools/mtng-dotnet-mono#336, contract ratified by #175). TS displays subscribe here for
// presentation context and snapshot over the same connect protocol they use everywhere. No
// commands: progression control is still open fog on map #42.
export { PresentationStateChanged } from "./messages/presentation/events.ts";
export { PresentationCurrentState } from "./messages/presentation/rpc.ts";

// timer domain — the Timer manager's message set: 2 events, 1 rpc, 7 commands.
export { TimerCueFired, TimerStateChanged } from "./messages/timer/events.ts";
export { TimerCurrentState } from "./messages/timer/rpc.ts";
export {
  TimerAdd,
  TimerClear,
  TimerPause,
  TimerResume,
  TimerSetCues,
  TimerSetTo,
  TimerSubtract,
} from "./messages/timer/commands.ts";
