import { z } from "zod";
import { backdropCommandEnvelope } from "./common.ts";

/**
 * Backdrop commands — exchange `mtng.commands`, routing key `backdrop.<name>[.<machine>]`.
 *
 * Both commands bind targeted **and** broadcast key forms: hiding the floor reveals the
 * desktop, and the reason to do it is troubleshooting one machine — broadcast-only would put
 * every wall in the room on the desktop to inspect one.
 *
 * The hide is session-scoped and dies with the process, deliberately — restarting the
 * backdrop always paints. There is no persistence for these commands to act on.
 */

/**
 * `backdrop.hide[.<machine>]` — hide the floor for a bounded time.
 *
 * `duration` is REQUIRED, with no default and no unbounded form: hide-forever is not
 * expressible over the wire. The receiver clamps against its locally configured cap, and a
 * second hide can only bring the return time earlier.
 */
export const BackdropHide = z
  .strictObject({
    ...backdropCommandEnvelope("hide"),
    duration: z
      .int()
      .min(1)
      .describe(
        "How long to hide the floor, in whole seconds. Required — no default, no unbounded " +
          "form. Enforced receiver-side against the locally configured cap: over-cap requests " +
          "are clamped, not rejected, and the effective deadline is reported on " +
          "backdrop.hidden. Under the monotonic rule a repeat hide only ever shortens.",
      ),
  })
  .describe(
    "Hide the floor for a bounded time, revealing the desktop to troubleshoot one machine. " +
      "duration is required and capped receiver-side; the floor is visible again within one " +
      "cap of the first hide, whatever arrives afterwards.",
  );

export type BackdropHide = z.infer<typeof BackdropHide>;

/**
 * `backdrop.show[.<machine>]` — return the floor now.
 *
 * Collapses the hide deadline to now. Envelope only: there is nothing to parameterize about
 * being covered.
 */
export const BackdropShow = z
  .strictObject({
    ...backdropCommandEnvelope("show"),
  })
  .describe(
    "Return the floor now — the hide deadline collapses to now. The floor confirms with " +
      "backdrop.shown, reason 'commanded'.",
  );

export type BackdropShow = z.infer<typeof BackdropShow>;
