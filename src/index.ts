/**
 * The TypeScript consumers' ALLOW-LIST.
 *
 * A message reaches a **TypeScript** consumer only if it is re-exported here. Anything not
 * exported from this barrel is single-language by default. Keep this surface small and
 * intentional (ADR-0005).
 *
 * **This is not the codegen list** (mtng-dotnet-mono ADR-0026). Every wire message is authored
 * in Zod under `src/messages/` and mirrored into C#, whether or not it is named here —
 * `npm run generate` walks the message modules, not this file. What this file decides is who
 * *receives* a type, which is the half of ADR-0005's scope clause that survived; the other
 * half, deciding whether C# exists at all, is how four hand-authored C# wire types accumulated
 * outside the drift gate.
 *
 * Every export must be a Zod schema whose name is PascalCase. The export name is also the
 * schema file name (kebab-cased) and the C# class name, so renaming one renames all three.
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
// sugar verbs, the named-state pair, and the rejection report cross here.
//
// The config-carrying messages — set-window, patch-window, set-bounds — stay OFF this barrel,
// but no longer for #315's reason. That reason was the mirror's: their geometry values were
// shape-discriminated unions and no oneOf/anyOf survives to C#. ADR-0026 removed the unions
// rather than teaching the mirror, so the argument is spent, and all three are now authored in
// Zod and mirrored like everything else (mtngtools/mtng-dotnet-mono#471). What keeps them off
// the barrel is the repo's own default: single-language until a TypeScript consumer needs
// them. Nothing in mtng-mono sends a window config today, and exporting later is additive
// while un-exporting is breaking — so the cheap direction is to wait for the consumer.
//
// window.close is off for its own reason, unchanged: every producer and its one consumer are
// .NET (mtngtools/mtng-dotnet-mono#314).
//
// window.request-windows-state and window.desired-state-changed are off too, and this is the
// one that is genuinely arguable — every other domain's snapshot-plus-state pair crosses
// (TimerCurrentState/TimerStateChanged, PresentationCurrentState/PresentationStateChanged).
// Those crossed because TS *displays* consume them. The window domain's consumers are .NET
// screen machines; a TS room console reading the room's desired state is plausible and
// unbuilt, and the day it exists this is two lines.
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
// operator-facing reports, and a room console is TS. Both are pure events with flat fields:
// two resolved rectangles, which were never a union even when set-window's geometry was one.
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
