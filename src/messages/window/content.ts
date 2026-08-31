import { z } from "zod";

/**
 * The `timer` member's config — the timer component's whole configurable surface
 * (mtngtools/mtng-dotnet-mono#276, spec `MtngTools.Core.UI.TimerComponent`).
 *
 * **Flat scalars**, mirroring the local C# options type it retires: the retirement is a
 * spelling change, not a reshape. The four stage colors are the `EscalationStage` families
 * (`none` < `warn` < `timesUp` < `over`) that the component's furthest-matched-stage rule
 * resolves to; `clearedColor` sits beside them rather than among them because `cleared` is a
 * lifecycle state, not an escalation stage.
 *
 * Every field has a `.default()`, so `{ contentType: 'timer', timer: {} }` is a fully
 * configured component — nothing here is a required decision at authoring time.
 */
const windowSlotContentTimer = z
  .strictObject({
    target: z
      .string()
      .min(1)
      .default("presentation-phase")
      .describe(
        "Which timer instance to display — the <target> routing segment of the timer " +
          "messages this component subscribes to. Defaults to 'presentation-phase', the " +
          "well-known key of the standing timer; configurable so future custom timer keys " +
          "need no rework.",
      ),
    noneColor: z
      .string()
      .min(1)
      .default("#43A047")
      .describe("Countdown color before any cue family has fired. Default: green."),
    warnColor: z
      .string()
      .min(1)
      .default("#FFB300")
      .describe("Countdown color once a 'warn'-family cue fires. Default: amber."),
    timesUpColor: z
      .string()
      .min(1)
      .default("#B23B3B")
      .describe("Countdown color once a 'timesUp'-family cue fires. Default: muted red."),
    overColor: z
      .string()
      .min(1)
      .default("#B23B3B")
      .describe(
        "Countdown color in overtime. Default: the same muted red as timesUpColor — the " +
          "pulse, not a new hue, is what marks overtime.",
      ),
    clearedColor: z
      .string()
      .min(1)
      .default("#9E9E9E")
      .describe(
        "Color of the wall clock shown in the cleared state, which is also the fallback of " +
          "last resort before any usable timer state has arrived. Default: gray.",
      ),
    pulseOnOver: z
      .boolean()
      .default(true)
      .describe(
        "Whether the overtime display pulses — a subtle pulse, never a flash. On by default.",
      ),
    transitionMs: z
      .int()
      .min(0)
      .default(300)
      .describe(
        "How long a view takes to cross-fade between stage colors, in whole MILLISECONDS — " +
          "the unit is in the name because every other duration in this contract counts in " +
          "seconds. 0 switches instantly.",
      ),
  })
  .describe(
    "The timer component's config: which timer it watches, the stage palette it renders " +
      "with, and its transition effects. Present iff contentType is 'timer'.",
  );

/**
 * The closed slot-content union — what a slot can be asked to hold
 * (mtngtools/mtng-dotnet-mono#114, #64).
 *
 * A **tagged record rather than a discriminated union**, because `oneOf` does not survive the
 * mirror to C# — see the README. `contentType` is the discriminant; each non-reserved value is
 * exactly an `IComponentRegistry` key on the host side (ADR-0011) and carries its component's
 * config as an `.optional()` member field named after it, with the `.check()` below enforcing
 * the present-iff-selected invariant. `timer` is the first such member
 * (mtngtools/mtng-dotnet-mono#276); the field is `.optional()` rather than defaulted so that
 * *selecting* a member is what makes its config appear, which is the invariant the check
 * states.
 *
 * **Closed on both sides of the generator:** an undeclared `contentType` fails schema
 * validation at the edge — Zod here, the mirrored enum in C# — so it never reaches the
 * registry, and an experimental component cannot be addressed into a stable host at runtime
 * (ADR-0001's boundary). Adding a member later is additive; closing an open union later would
 * be breaking, so it starts shut.
 *
 * `static` is the one **reserved** value: it carries no payload and routes to the paint path —
 * the slot renders its resolved static content, never a mounted component. Content is never
 * null, so "set a slot to static content" is `{ contentType: 'static' }`, keeping the union
 * exhaustive with no null-vs-absent ambiguity. Its named extension — optional fields carrying
 * the content itself — is recorded in the MTWindows spec, not built.
 */
export const WindowSlotContent = z
  .strictObject({
    contentType: z
      .enum(["static", "timer"])
      .describe(
        "Which content this slot should hold. 'static' is the one reserved value — no " +
          "payload, routed to the paint path (the slot renders its resolved static content). " +
          "Every non-reserved value is exactly an IComponentRegistry key on the host side, " +
          "one name end to end, and carries its config in the field of the same name. " +
          "Closed: an undeclared value fails schema validation at the edge and never reaches " +
          "the registry.",
      ),
    timer: windowSlotContentTimer.optional(),
  })
  .check((ctx) => {
    const { contentType, timer } = ctx.value;

    if (contentType === "timer" && timer === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["timer"],
        message: "contentType 'timer' carries a timer config",
      });
    }

    if (contentType !== "timer" && timer !== undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["timer"],
        message: "only contentType 'timer' carries a timer config",
      });
    }
  })
  .describe(
    "A slot's desired content, discriminated on contentType. Closed: 'static' (reserved, no " +
      "payload — render the slot's resolved static content) and 'timer' (the timer " +
      "component, carrying its config in the 'timer' field). A component member's config " +
      "field is present iff its contentType is selected. Never null — a slot with no " +
      "component mounted is set to static, not to nothing.",
  );

export type WindowSlotContent = z.infer<typeof WindowSlotContent>;
