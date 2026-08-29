import { z } from "zod";
import { windowEventEnvelope } from "./common.ts";

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
