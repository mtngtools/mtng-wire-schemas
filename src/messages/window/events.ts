import { z } from "zod";
import { windowEventEnvelope, windowOptionallyTargetedEventEnvelope } from "./common.ts";

/**
 * Window events — exchange `mtng.events`, routing key `window.<name>.<windowId>`.
 *
 * Noun-past-participle shape. MTWindows publishes these as a Client in a domain it does not
 * own — permitted, since one-domain-one-owner governs desired state, not event publishing.
 */

/**
 * `window.slot-content-failed.<windowId>` — a mount failed, and this is the report.
 *
 * The **only** place a mount failure surfaces. Nothing is painted into the slot —
 * audience-facing displays don't broadcast trouble — but silent on screen isn't silent
 * everywhere: this event reaches operators, and tells the Windows State Manager desired state
 * wasn't reached. Mount failures only — a static component has no mount, so its failures ride
 * `window.asset-unresolved`, never this.
 */
export const WindowSlotContentFailed = z
  .strictObject({
    ...windowEventEnvelope("slot-content-failed"),
    slotId: z
      .string()
      .min(1)
      .describe("The slot whose mount failed, within the window's layout."),
    contentType: z
      .string()
      .min(1)
      .describe(
        "The contentType the failed mount asked for, verbatim. A plain string rather than " +
          "the closed union's enum, because one of the reported failures is exactly an " +
          "undeclared value that never parsed into it.",
      ),
    reason: z
      .string()
      .min(1)
      .describe(
        "Why the mount failed, human-readable: schema validation (including an undeclared " +
          "contentType), a content type missing from the registry, a throw while " +
          "constructing or initializing the component, or a dispose timeout. Consumers key " +
          "off slotId and contentType, never off parsing this text.",
      ),
  })
  .describe(
    "A slot mount failed — the incumbent content is left running and nothing is painted " +
      "into the slot, but silent on screen isn't silent everywhere: this is the report that " +
      "reaches operators and tells the Windows State Manager desired state wasn't reached.",
  );

export type WindowSlotContentFailed = z.infer<typeof WindowSlotContentFailed>;

/**
 * `window.config-rejected[.<windowId>]` — a configuration was rejected, and this is why.
 *
 * The single event behind every "rejected at configuration time" rule, published by whichever
 * party held the rule: MTWindows for what a window validates (WindowId charset, a Set changing
 * kind, composite-label contradictions, contradictory chrome), the Windows State Manager for
 * what it validates (undefined preset names, preset-plus-fields, an unknown stateKey). The
 * consumer's handling is identical each time: tell an operator the config is wrong and say
 * which part.
 *
 * Target is optional, unlike the other window events: a WindowId that failed charset
 * validation has no window to address.
 */
export const WindowConfigRejected = z
  .strictObject({
    ...windowOptionallyTargetedEventEnvelope("config-rejected"),
    rejected: z
      .string()
      .min(1)
      .describe(
        "The offending part of the configuration, as a documented part name: 'windowId', " +
          "'kind', 'bounds', 'chrome', 'position', 'size', 'layout', 'staticContent', " +
          "'stateKey'. The vocabulary grows with the rules; consumers key off this field, " +
          "never off parsing reason.",
      ),
    reason: z
      .string()
      .min(1)
      .describe(
        "Why that part was rejected, human-readable — for the operator the event exists to " +
          "reach. Consumers key off rejected, never off parsing this text.",
      ),
  })
  .describe(
    "A configuration was rejected at configuration time, never silently reconciled — and " +
      "every rejection reports here, naming the offending part. Desired state was not " +
      "reached; silent on screen is never silent everywhere.",
  );

export type WindowConfigRejected = z.infer<typeof WindowConfigRejected>;

/**
 * `window.asset-unresolved[.<windowId>]` — a configured asset could not become an image.
 *
 * The same shape of failure as `window.display-unsatisfied`: a name in configuration that
 * could not become a real thing. The static-content library cannot publish — it reports
 * synchronously to its host — so MTWindows publishes on its behalf, and the slot degrades to
 * what `Solid` paints rather than blanking. A config valid on seven machines and broken on the
 * eighth is *degraded*, not *rejected*: the malformed-reference cases (absolute path, drive
 * letter, UNC root, traversal, missing extension) are knowable with no filesystem at all and
 * ride `window.config-rejected` instead.
 *
 * Mount failures never come here, and these never ride `window.slot-content-failed` — a static
 * component is painted, not mounted, so it has no mount to fail.
 *
 * Target is optional, like `window.config-rejected` but for a different reason: one asset may
 * be referenced by several windows, and by the system default preset, which belongs to no
 * window. A report no single window can honestly own goes out on the broadcast key form.
 */
export const WindowAssetUnresolved = z
  .strictObject({
    ...windowOptionallyTargetedEventEnvelope("asset-unresolved"),
    target: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The WindowId whose configuration reached this asset — the <target> routing segment. " +
          "Absent when no single window owns the failure: one asset may be referenced by " +
          "several windows, and by the system default preset, which belongs to no window.",
      ),
    asset: z
      .string()
      .min(1)
      .describe(
        "The asset reference that could not be resolved, as written in configuration — a " +
          "path relative to the machine's assets root, extension included.",
      ),
    reason: z
      .enum(["missing", "outsideRoot", "undecodable", "animated"])
      .describe(
        "Why the asset could not become an image — the shared static-content reasons: " +
          "'missing' — no file at the reference; 'outsideRoot' — the reference canonicalizes " +
          "outside the assets root; 'undecodable' — the file is not a decodable image; " +
          "'animated' — an animated image is not static, and is refused whatever its " +
          "extension says: animation is a fact about the bytes, so a GIF renamed .png is " +
          "still animated.",
      ),
  })
  .describe(
    "A configured asset reference could not be turned into an image at warm time. The slot " +
      "degrades to what Solid paints and keeps painting — this event is the report reaching " +
      "whoever just replaced the artwork, and it tells the Windows State Manager desired " +
      "state was not reached.",
  );

export type WindowAssetUnresolved = z.infer<typeof WindowAssetUnresolved>;

/**
 * `window.display-unsatisfied.<windowId>` — the window's DisplaySelection was unsatisfiable
 * and a fallback was taken.
 *
 * A window config stores no display identifier, only a plan resolved against whatever hardware
 * is present. When the plan names a panel that is not there — an Index past the list, `other`
 * on a one-display box — the fallback chain finds somewhere to land and the window goes there.
 * Desired state was not reached; techs need notice that something wants fixing.
 *
 * Its shape deliberately matches `window.config-rejected`: one keyed field a consumer switches
 * on, one free-text line for the human. The difference is when each can fire — a rejection is a
 * configuration-time verdict, while this is a runtime one, because which panels are plugged in
 * is not knowable when the config is written.
 */
export const WindowDisplayUnsatisfied = z
  .strictObject({
    ...windowEventEnvelope("display-unsatisfied"),
    fallback: z
      .enum([
        "offscreen",
        "primary",
        "firstOther",
        "lastOther",
        "firstLeft",
        "lastLeft",
        "firstTop",
        "lastTop",
      ])
      .describe(
        "The DisplaySelectionFallbackMode the window carries — the whole closed set, so a " +
          "consumer switches rather than string-matches. Always present: a normalized config " +
          "has its kind default applied (screenWindow to offscreen, controlWindow to " +
          "lastOther). 'offscreen' resolves to no display at all — a computed position " +
          "beyond the rightmost one — while every other member names a display the chain " +
          "found. Consumers key off this field, never off parsing reason.",
      ),
    reason: z
      .string()
      .min(1)
      .describe(
        "What was unsatisfiable and where the window actually landed, human-readable — for " +
          "the tech the event exists to reach. Consumers key off fallback, never off parsing " +
          "this text.",
      ),
  })
  .describe(
    "A window's display plan named a panel that is not present, so the fallback chain placed " +
      "it somewhere else. The chain always terminates, so the window is never left without a " +
      "position — but it is not on the panel it was authored for, and this is the only place " +
      "that says so.",
  );

export type WindowDisplayUnsatisfied = z.infer<typeof WindowDisplayUnsatisfied>;

/**
 * `window.bounds-overflowed.<windowId>` — resolved bounds are not fully inside the reference
 * rectangle.
 *
 * One rule, one event, no orphan detector: the reference rectangle is a display area for a
 * display-anchored window, the virtual desktop for an OS-explicit one, and the target window
 * for a following one. Overflow is well-defined arithmetic and cannot be caught at
 * configuration time — which panel a window lands on is a runtime fact — so it is allowed,
 * never clamped and never rejected. Clamping would silently rewrite what the author wrote, and
 * deliberate overhang is legitimate.
 *
 * Both rectangles ride the event because "overflowed" on its own cannot tell a tech whether
 * this is two pixels of overhang or a window most of the way off the wall.
 */
export const WindowBoundsOverflowed = z
  .strictObject({
    ...windowEventEnvelope("bounds-overflowed"),
    bounds: z
      .strictObject({
        x: z.int().describe("Left edge, in the reference rectangle's coordinate space."),
        y: z.int().describe("Top edge, in the reference rectangle's coordinate space."),
        width: z.int().describe("Outer width — chrome included, so a decorations toggle preserves it."),
        height: z.int().describe("Outer height — chrome included, so a decorations toggle preserves it."),
      })
      .describe(
        "The window's resolved outer rectangle, as applied — outer, so chrome is included " +
          "and a decorations toggle preserves it. Same unit and virtual-desktop coordinate " +
          "space the display source reports its display bounds in; which unit that is per OS " +
          "is the MTWindows spec's units table, not this field's to restate.",
      ),
    reference: z
      .strictObject({
        x: z.int().describe("Left edge of the rectangle the geometry was measured against."),
        y: z.int().describe("Top edge of the rectangle the geometry was measured against."),
        width: z.int().describe("Width of the rectangle the geometry was measured against."),
        height: z.int().describe("Height of the rectangle the geometry was measured against."),
      })
      .describe(
        "The rectangle the window overflowed: the resolved display's full bounds or working " +
          "area for a display-anchored window, the virtual desktop for an OS-explicit one, " +
          "and the followed window's outer or client area for a following one. One rule, one " +
          "event, whichever arm the window's position took. Same unit and coordinate space " +
          "as bounds, so the overhang is bounds minus this.",
      ),
  })
  .describe(
    "A window's resolved bounds are not fully inside the rectangle they were measured " +
      "against. Overflow is allowed, never clamped and never rejected — the bounds stand as " +
      "computed — but silent on screen is never silent everywhere, so it is reported here.",
  );

export type WindowBoundsOverflowed = z.infer<typeof WindowBoundsOverflowed>;
