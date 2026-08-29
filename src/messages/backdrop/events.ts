import { z } from "zod";
import { backdropEventEnvelope } from "./common.ts";

/**
 * Backdrop events — exchange `mtng.events`, routing key `backdrop.<name>.<machine>`.
 *
 * Always targeted: the floor speaks only for its own machine. Publishing never blocks or
 * fails painting — the floor logs unconditionally and publishes additionally when connected,
 * so a broker outage loses the report and nothing else.
 */

/**
 * `backdrop.hidden.<machine>` — the floor is hidden, and this is when it comes back.
 *
 * Carries the **effective** (post-clamp) deadline, because clamping without it is silent
 * failure at a distance: commands federate into a room from central, so the sender is
 * frequently not in the room — an hour asked against a ten-minute cap must report the ten
 * minutes somewhere reachable.
 */
export const BackdropHidden = z
  .strictObject({
    ...backdropEventEnvelope("hidden"),
    deadline: z
      .iso
      .datetime()
      .describe(
        "The EFFECTIVE return deadline — post-clamp, as an absolute ISO-8601 UTC instant. " +
          "The floor is visible again no later than this, whatever arrives afterwards: a " +
          "repeat hide can only bring it earlier.",
      ),
  })
  .describe(
    "The floor is hidden, and this is when it comes back. The deadline is the effective " +
      "(post-clamp) one, so a sender clamped against the local cap learns the real return " +
      "time somewhere reachable.",
  );

export type BackdropHidden = z.infer<typeof BackdropHidden>;

/**
 * `backdrop.shown.<machine>` — the floor is back, and why.
 *
 * The brief return after a hide expires is the room proving the floor is alive; an operator
 * needing more time waits for this and hides again.
 */
export const BackdropShown = z
  .strictObject({
    ...backdropEventEnvelope("shown"),
    reason: z
      .enum(["commanded", "expired"])
      .describe(
        "Why the floor returned: 'commanded' — a show arrived; 'expired' — the hide deadline " +
          "passed.",
      ),
  })
  .describe(
    "The floor is back, and why: a show command, or the hide deadline expiring. The return " +
      "after an expiry is the room proving the floor is alive.",
  );

export type BackdropShown = z.infer<typeof BackdropShown>;

/**
 * `backdrop.asset-unresolved.<machine>` — a configured asset could not become an image.
 *
 * The static-content library reports synchronously to its host, and this host publishes: the
 * person who needs the fact is whoever just replaced `logo.jpg` and wonders why the floor is
 * still plain. The floor degrades to its solid background either way — this event is the
 * report, never a change in the guarantee.
 */
export const BackdropAssetUnresolved = z
  .strictObject({
    ...backdropEventEnvelope("asset-unresolved"),
    asset: z
      .string()
      .min(1)
      .describe("The asset reference that could not be resolved, as written in configuration."),
    reason: z
      .enum(["missing", "outsideRoot", "undecodable", "animated"])
      .describe(
        "Why the asset could not become an image — the shared static-content reasons: " +
          "'missing' — no file at the reference; 'outsideRoot' — the reference escapes the " +
          "assets root; 'undecodable' — the file is not a decodable image; 'animated' — " +
          "animated images are rejected by policy.",
      ),
  })
  .describe(
    "A configured asset reference could not be turned into an image. The floor degrades to " +
      "its solid background and keeps painting — this event is the report reaching whoever " +
      "just replaced the artwork.",
  );

export type BackdropAssetUnresolved = z.infer<typeof BackdropAssetUnresolved>;
