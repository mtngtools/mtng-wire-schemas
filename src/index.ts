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

// window domain — the placement verdicts, ruled dual-language by
// mtngtools/mtng-dotnet-mono#316 on the reasoning #315 gave config-rejected: these are
// operator-facing reports, and a room console is TS. Both are pure events with flat fields,
// so nothing here strains the mirror — the geometry UNIONS are what kept set-window
// single-language, and a resolved rectangle is not a union.
export {
  WindowBoundsOverflowed,
  WindowDisplayUnsatisfied,
} from "./messages/window/events.ts";

// presentation domain — the Present manager's pointer and its snapshot RPC, both dual-language
// (mtngtools/mtng-dotnet-mono#336, contract ratified by #175). TS displays subscribe here for
// presentation context and snapshot over the same connect protocol they use everywhere.
export { PresentationStateChanged } from "./messages/presentation/events.ts";
export { PresentationCurrentState } from "./messages/presentation/rpc.ts";

// presentation domain — the command set and its one echo (mtngtools/mtng-dotnet-mono#383, specced
// by #374). All seven dual, ruled per message:
//
//   - enter is the SelfContained report path, and ADR-0024 defines that dialect around producers
//     who are deliberately NOT version-pinned to the room. A third-party producer holding a deck
//     open is as likely .NET on the lectern as it is TS, so the report has to be sayable from
//     both sides or the dialect only half exists.
//   - exit is enter's pair. Splitting them would let a client say the room entered a
//     presentation and not that it left one — a state it could enter and never escape.
//   - the four goto-* come from an operator control surface, which is TS, and are consumed by
//     the .NET Present manager. That is the cross-language case exactly, and it is the reasoning
//     #315 gave the window sugar verbs (hide/show) for the same shape of traffic.
//   - slide-navigated is the acknowledgement of those four. The backdrop set's rule applies
//     unchanged: a commands-dual/events-single split would let a console send goto-next-slide
//     and not read the echo telling it the move happened.
//
// Nothing here strains the mirror — every member is a scalar, a closed enum, or the same
// presentationFile the pointer already ships.
export {
  PresentationEnter,
  PresentationExit,
  PresentationGotoFirstSlide,
  PresentationGotoLastSlide,
  PresentationGotoNextSlide,
  PresentationGotoPreviousSlide,
} from "./messages/presentation/commands.ts";
export { PresentationSlideNavigated } from "./messages/presentation/events.ts";

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
