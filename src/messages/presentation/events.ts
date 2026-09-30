import { z } from "zod";
import {
  duplicateInstanceIds,
  presentationContext,
  presentationGroup,
} from "../../shared/presentation-context.ts";
import { addressedInstance, presentationEnvelope } from "./common.ts";

/**
 * Presentation events — exchange `mtng.events`, routing key `presentation.<name>`.
 */

/**
 * `presentation.state-changed` — the pointer.
 *
 * A full, self-contained statement of the room's current presentation state, published on
 * **every** transition (entering `none` included) and on boot re-broadcast. Because it is a
 * statement and not a delta, a broadcast and an RPC reply are the same shape applied by the
 * same code — which is why `presentation.current-state` replies with this very message.
 *
 * **Thin at the core, and the groups beside it.** The four members below are needed in both
 * dialects and stay the always-present core; in a `Linked` room displays may join `prId` against
 * the Meeting data manager's own broadcast, and the Timer manager takes only the key from here.
 * What a producer knows besides rides the optional groups — the `presentation` itself, the
 * `session`, the `files` — and a producer may always send them, whatever the room's dialect
 * (ADR-0033). The core stays thin either way — what changes is whether anything else is present
 * at all.
 *
 * A **tagged record rather than a discriminated union**, because `oneOf` does not survive the
 * mirror to C# — see the README. The invariants the union would have carried — the body is
 * present iff `phase ≠ none`, the groups never ride `none`, the group's `prId` is the core's —
 * are enforced by the `.check()` below, so this side still rejects a malformed pointer; JSON
 * Schema and C# carry the structure only.
 */
export const PresentationStateChanged = z
  .strictObject({
    ...presentationEnvelope("state-changed", "event"),
    phase: z
      .enum(["intro", "talk", "qa", "none"])
      .describe(
        "Where in the presentation the room is, or 'none' for no presentation. " +
          "DEFAULT-TO-TALK: the manager stamps 'talk' whenever the phase is not explicitly " +
          "'intro' or 'qa', so a 'talk' may be authored or defaulted and the two are " +
          "indistinguishable on the wire — there is no 'unknown' value and no source flag. " +
          "Consumers must not key logic on phase alone; corroborate it against enteredAt and " +
          "prId.",
      ),
    prId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Opaque id of the presentation as held by the Meeting data manager (either ingest " +
          "path). MATCHED BYTE-WISE, NEVER PARSED: no structure is promised, and equality is " +
          "the only operation defined on it. Present iff phase ≠ none. When the presentation " +
          "group rides, its prId equals this one.",
      ),
    actualPrStart: z
      .iso
      .datetime()
      .optional()
      .describe(
        "When the BLOCK actually started, ISO-8601 UTC in the room time-authority's frame — " +
          "stamped at first phase-begin. MAY BE RE-STAMPED MID-PHASE: a live block fact, not " +
          "an equality key (that is enteredAt). Wire spelling of the spec term actual_prStart. " +
          "Present iff phase ≠ none.",
      ),
    enteredAt: z
      .iso
      .datetime()
      .describe(
        "When the CURRENT STATE was entered, ISO-8601 UTC — entering 'none' is itself a " +
          "stamped transition. Required always, with no default: a pointer lacking it fails " +
          "validation and is unreadable. EQUALITY KEY: byte-identical on every republish of " +
          "the same state — boot re-broadcast and mid-phase actualPrStart re-stamp included — " +
          "and preserved across the manager's own restart, where it is restored from the " +
          "retained snapshot rather than re-minted. A re-minted stamp is monotonic and " +
          "plausible, and silently breaks every consumer keying on this.",
      ),
    // Spread bare, with no wrapping .describe(): one here would REPLACE the entity's own,
    // silently shipping this site's words in place of the shape's and losing its invariants.
    presentation: presentationGroup.optional(),
    ...presentationContext(),
  })
  .check((ctx) => {
    const { phase, prId, actualPrStart, presentation, session, files } = ctx.value;

    for (const duplicate of duplicateInstanceIds(files)) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["files"],
        message: `instanceId '${duplicate}' appears more than once — one entry per instance`,
      });
    }

    if (phase === "none") {
      // The groups describe a presentation, and 'none' is the absence of one — so a room in
      // 'none' carries none of them, in either dialect.
      for (const [name, group] of [
        ["presentation", presentation],
        ["session", session],
        ["files", files],
      ] as const) {
        if (group !== undefined) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: [name],
            message: `phase 'none' carries no ${name}`,
          });
        }
      }

      if (prId !== undefined) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["prId"],
          message: "phase 'none' carries no prId",
        });
      }

      if (actualPrStart !== undefined) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["actualPrStart"],
          message: "phase 'none' carries no actualPrStart",
        });
      }

      return;
    }

    if (prId === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["prId"],
        message: "a phase other than 'none' carries prId",
      });
    }

    if (actualPrStart === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["actualPrStart"],
        message: "a phase other than 'none' carries actualPrStart",
      });
    }

    if (presentation !== undefined && prId !== undefined && presentation.prId !== prId) {
      // Identity misfiles data: a group filed under the wrong id would be joined, cached and
      // resolved as some other presentation's. The one cross-group invariant.
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["presentation", "prId"],
        message: `the presentation group's prId '${presentation.prId}' is not the core's '${prId}'`,
      });
    }
  })
  .describe(
    "The room's presentation pointer: a full, self-contained statement of the current state, " +
      "published on every transition (entering 'none' included) and on boot re-broadcast. The " +
      "same shape answers the current-state RPC, so a snapshot and a transition are applied by " +
      "the same code. prId and actualPrStart are present iff phase ≠ none; enteredAt is always " +
      "present and is the equality key for 'same state'. A producer adds the optional groups it " +
      "holds — presentation, session and files — whatever the room's dialect; phase 'none' " +
      "never carries them, and the presentation group's prId equals the core's.",
  );

export type PresentationStateChanged = z.infer<typeof PresentationStateChanged>;

/**
 * `presentation.slide-navigated` — the navigation echo.
 *
 * Published so others can react, and usable as the acknowledgement of a `goto-*` command. It is
 * **informational**: an observation, not something anyone on the backbone executes — actuation
 * stopped at the Manager (mtngtools/mtng-dotnet-mono#375).
 *
 * **NOT RETAINED, AND NOT RE-BROADCAST ON BOOT.** This is the one presentation message the
 * recovery pattern does not cover, and the reason is structural rather than a policy choice:
 * `enter` and `exit` fold into the pointer, so a restarting Manager republishes them by
 * republishing its state, but the four `goto-*` commands fold into *nothing*. There is no slide
 * in this model and so no slide position to restore — a retained echo would assert a navigation
 * that is not happening, at a `ts` that is not now.
 *
 * **One event where there are four commands.** The commands split into four routing keys because
 * a key is the authorization subject, and that split is a write-side concern; a subscriber needs
 * no matching fan-out, so `navigation` carries which one fired.
 */
export const PresentationSlideNavigated = z
  .strictObject({
    ...presentationEnvelope("slide-navigated", "event"),
    navigation: z
      .enum(["next", "previous", "first", "last"])
      .describe(
        "Which navigation was actuated — the <value> of the goto-<value>-slide command this " +
          "echoes. One event carries all four because the commands' split into four routing " +
          "keys exists to make each an authorization subject, which is a write-side concern. " +
          "Without this member a client could not tell its own goto-next-slide from another " +
          "operator's goto-first-slide.",
      ),
    ...addressedInstance(),
  })
  .describe(
    "The navigation echo: a goto-*-slide command was actuated. Published so others can react, " +
      "and usable as the acknowledgement — navigation gets an echo precisely because it changes " +
      "no state, where enter and exit are acknowledged by the pointer they change. NOT RETAINED " +
      "AND NOT RE-BROADCAST ON BOOT: there is no slide in this model, so there is no slide " +
      "position for a restarting manager to restore.",
  );

export type PresentationSlideNavigated = z.infer<typeof PresentationSlideNavigated>;
