import { z } from "zod";
import {
  duplicateInstanceIds,
  presentationContext,
} from "../../shared/presentation-context.ts";
import { presentationEnvelope } from "./common.ts";

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
 * **Thin at the core, a superset in `SelfContained`.** The four members below are needed in both
 * dialects and stay the always-present core; a `Linked` room sends nothing else, and displays
 * join `presentationId` against the Meeting data manager's own broadcast. A `SelfContained` room
 * has no such manager, so the context it would have joined for rides the four optional groups
 * instead (ADR-0024; mtngtools/mtng-dotnet-mono#372). The core stays thin either way — what
 * changes is whether anything else is present at all.
 *
 * A **tagged record rather than a discriminated union**, because `oneOf` does not survive the
 * mirror to C# — see the README. The invariant the union would have carried — the body is
 * present iff `phase ≠ none` — is enforced by the `.check()` below, so this side still rejects
 * a malformed pointer; JSON Schema and C# carry the structure only.
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
          "presentationId.",
      ),
    presentationId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Opaque id of the presentation as held by the Meeting data manager (either ingest " +
          "path). MATCHED BYTE-WISE, NEVER PARSED: no structure is promised, and equality is " +
          "the only operation defined on it. Present iff phase ≠ none.",
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
    ...presentationContext(),
  })
  .check((ctx) => {
    const { phase, presentationId, actualPrStart, block, session, timer, files } = ctx.value;

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
        ["block", block],
        ["session", session],
        ["timer", timer],
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

      if (presentationId !== undefined) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["presentationId"],
          message: "phase 'none' carries no presentationId",
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

    if (presentationId === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["presentationId"],
        message: "a phase other than 'none' carries presentationId",
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
  })
  .describe(
    "The room's presentation pointer: a full, self-contained statement of the current state, " +
      "published on every transition (entering 'none' included) and on boot re-broadcast. The " +
      "same shape answers the current-state RPC, so a snapshot and a transition are applied by " +
      "the same code. presentationId and actualPrStart are present iff phase ≠ none; enteredAt " +
      "is always present and is the equality key for 'same state'. A SelfContained room adds the " +
      "four optional groups — block, session, timer and files — which a Linked room never sends " +
      "and which phase 'none' never carries.",
  );

export type PresentationStateChanged = z.infer<typeof PresentationStateChanged>;
