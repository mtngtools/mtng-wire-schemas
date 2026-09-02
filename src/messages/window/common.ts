import { z } from "zod";

/**
 * Shared building blocks for the `window` domain's wire messages.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel — these
 * are the pieces every window message is assembled from.
 *
 * `window` is owned by the Windows State Manager (mtng-dotnet-mono ADR-0013's
 * one-domain-one-owner); MTWindows is a Client that publishes `window.*` events in a domain it
 * does not own — permitted, since ownership governs desired state, not event publishing (the
 * MTWindows spec, §Authority and lifecycle).
 *
 * The domain's dual-language surface is ruled per message (MTWindows wire-messages.md,
 * §Dual-language surface): the slot-content trio crossed with mtngtools/mtng-dotnet-mono#312
 * (web components connect directly over WebSockets — ADR-0005), and the configuration
 * surface's simple messages — hide/show, apply-state/clear, config-rejected — with
 * mtngtools/mtng-dotnet-mono#315, joined by asset-unresolved with
 * mtngtools/mtng-dotnet-mono#319 (an operator-facing report of two plain fields, and the
 * identical backdrop.asset-unresolved already crosses) and by the placement verdicts —
 * display-unsatisfied, bounds-overflowed — with mtngtools/mtng-dotnet-mono#316, on the same
 * reasoning: operator-facing reports, and a room console is TS.
 *
 * **Every message in this domain is authored here, exported or not** (ADR-0026,
 * mtngtools/mtng-dotnet-mono#471). The config-carrying messages — set-window, patch-window,
 * set-bounds — plus close and the snapshot pair are mirrored into C# like everything else and
 * simply stay off the barrel; §Dual-language surface used to call them single-language because
 * their geometry unions could not ride the oneOf-less mirror, and that reason is spent: the
 * unions were removed rather than the mirror taught. See `config.ts` for the dialect that
 * replaced them, and `src/index.ts` for what keeps each of them off the barrel now.
 *
 * The authoring rules these follow (`.describe()` over JSDoc, `z.enum` over `z.literal`, no
 * `z.discriminatedUnion`, no `.nullable()`) are in the repo README, with the generator output
 * that settles each one.
 */

const envelopeCore = <TType extends string, TKind extends "event" | "command" | "rpc">(
  type: TType,
  kind: TKind,
) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z
    .enum(["window"])
    .describe(
      "The owning domain — <domain> in the routing key. Owned by the Windows State Manager; " +
        "MTWindows is a Client publishing events in a domain it does not own.",
    ),
  kind: z
    .enum([kind])
    .describe("Which exchange carries this message. Never reaches the routing key."),
  ts: z
    .iso
    .datetime()
    .describe("When the sender published this message, ISO-8601 UTC."),
});

/**
 * The envelope of a window-addressed **command**: `{type, domain, kind, ts, target?}`.
 *
 * `target` is optional because every window-addressed command has a broadcast form alongside
 * the targeted one — a command with no target reaches every window in the room.
 */
export const windowCommandEnvelope = <TType extends string>(type: TType) => ({
  ...envelopeCore(type, "command"),
  target: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The WindowId this command addresses — the <target> routing segment. Absent on the " +
        "broadcast form, which every window in the room applies. Authored by whoever writes " +
        "the config, AMQP-topic-safe ([a-z0-9-]), and there is no identity beyond the string.",
    ),
});

/**
 * The envelope of a **Manager-addressed, window-naming command**: `{type, domain, kind, ts,
 * target}`, target required.
 *
 * The patch-and-sugar surface names a `WindowId` in the target segment but is bound by the
 * Windows State Manager, never by a window (§Who binds what): the Manager merges into stored
 * desired state and re-emits the whole-config Set. Target is required — sugar expands to
 * exactly one patch, and a patch with nobody to patch is meaningless.
 */
export const windowManagerTargetedCommandEnvelope = <TType extends string>(
  type: TType,
  targetDescription = "The WindowId whose stored desired state this command patches — the " +
    "<target> routing segment. Required: the sugar expands to exactly one patch. Bound by " +
    "the Windows State Manager, not by any window, even though the key names a WindowId.",
) => ({
  ...envelopeCore(type, "command"),
  target: z.string().min(1).describe(targetDescription),
});

/**
 * The envelope of a **Manager-addressed RPC request**: `{type, domain, kind, ts}`, no target.
 *
 * `window.request-windows-state` addresses the Manager, whose store is room-wide, and the
 * reply it answers with owns the whole collection rather than one window's slice — so there is
 * no window to name and the field does not exist rather than being optional.
 */
export const windowManagerRpcEnvelope = <TType extends string>(type: TType) =>
  envelopeCore(type, "rpc");

/**
 * The envelope of a **room-wide event**: `{type, domain, kind, ts}`, no target segment.
 *
 * The state document is the one holder. Every window event above speaks for one window and so
 * carries a target; the Manager's document speaks for the whole room's desired state, and
 * naming a window on it would invite a reader to think it carried only that window's slice.
 */
export const windowRoomEventEnvelope = <TType extends string>(type: TType) =>
  envelopeCore(type, "event");

/**
 * The envelope of a **Manager-addressed, room-wide command**: `{type, domain, kind, ts}`,
 * no target segment at all.
 *
 * `window.apply-state` / `window.clear` address the Manager, whose store is room-wide —
 * there is no window to name, so the field does not exist rather than being optional.
 */
export const windowManagerCommandEnvelope = <TType extends string>(type: TType) =>
  envelopeCore(type, "command");

/**
 * The envelope of a window **event**: `{type, domain, kind, ts, target}`.
 *
 * `target` is required — a window speaks only for itself, so every event is published on the
 * targeted key form.
 */
export const windowEventEnvelope = <TType extends string>(type: TType) => ({
  ...envelopeCore(type, "event"),
  target: z
    .string()
    .min(1)
    .describe(
      "The WindowId reporting — the <target> routing segment. Required: a window speaks only " +
        "for itself.",
    ),
});

/**
 * The envelope of a window event whose target is **optional**: `{type, domain, kind, ts,
 * target?}`.
 *
 * Two holders, and **their reasons differ** — which is why the default `target` description
 * below is config-rejected's and asset-unresolved overrides it:
 *
 * - `window.config-rejected` — a WindowId that failed charset validation has no window to
 *   address, so the rejection goes out on the broadcast key form. The absence is about the id.
 * - `window.asset-unresolved` — one asset may be referenced by several windows, and by the
 *   system default preset, which belongs to no window. The absence is about *ownership*: no
 *   single window can honestly claim the failure.
 *
 * A third holder should state which of these it is, or a new reason, rather than inheriting
 * prose that happens to be about somebody else's case.
 */
export const windowOptionallyTargetedEventEnvelope = <TType extends string>(type: TType) => ({
  ...envelopeCore(type, "event"),
  target: z
    .string()
    .min(1)
    .optional()
    .describe(
      "The WindowId the report concerns — the <target> routing segment. Absent when the " +
        "offending part is the WindowId itself: an id that failed validation has no window " +
        "to address.",
    ),
});
