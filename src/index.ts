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
