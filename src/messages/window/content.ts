import { z } from "zod";

/** One value on all four sides — the shape a four-sided default takes. */
const allSides = (value: number) => ({ top: value, right: value, bottom: value, left: value });

/**
 * One stage's three colours (mtngtools/mtng-dotnet-mono#434, spec
 * `MtngTools.Core.UI.TimerComponent` §The face).
 *
 * **Colour follows the stage.** Each of the four escalation families and the `cleared`
 * lifecycle state carries the digits, the fill and the rim — and since #434 it is the *fill*
 * that carries the stage hue, because a filled panel reads from the back of a room where
 * coloured glyphs do not.
 *
 * **Opacity is the colour's own alpha** — `#rrggbbaa`, six digits meaning opaque — so no
 * opacity field can drift from its hue. The mirror emits `string`; the component parses it
 * once at mount, and a malformed colour fails that mount.
 *
 * A **factory rather than one shared schema**, because every stage supplies its own defaults:
 * five differently-defaulted objects under five differently-named properties, which the C#
 * mirror scopes as `WindowSlotContentNone`, `…Warn`, `…TimesUp`, `…Over` and `…Cleared`.
 *
 * Each call documents AND defaults itself in full, and the embedding site adds nothing — a
 * `.describe()` on a wrapper *replaces* the description of the shape it wraps (README), so a
 * second description at the embedding site would silently drop everything said here, and a
 * second default there would be every colour written out twice.
 */
const stageColors = (
  color: string,
  background: string,
  borderColor: string,
  stage: string,
  face: string,
) =>
  z
    .strictObject({
      color: z
        .string()
        .min(1)
        .default(color)
        .describe(
          `The digits in the ${stage} treatment, as '#rrggbb' or '#rrggbbaa' — six digits ` +
            "mean opaque. Contrast-neutral by default: the stage hue is carried by the fill, " +
            "not the glyphs.",
        ),
      background: z
        .string()
        .min(1)
        .default(background)
        .describe(
          `The fill behind the digits in the ${stage} treatment, as '#rrggbb' or ` +
            "'#rrggbbaa'. This is where the stage colour lives, because a filled panel reads " +
            "from the back of a room where coloured glyphs do not.",
        ),
      borderColor: z
        .string()
        .min(1)
        .default(borderColor)
        .describe(
          `The rim around the fill in the ${stage} treatment, as '#rrggbb' or '#rrggbbaa'. ` +
            "Invisible until the face's borderThickness is raised above zero.",
        ),
    })
    .describe(
      `The ${stage} treatment: ${face}. Three colours — the digits, the fill that carries ` +
        "the stage hue, and the rim — each '#rrggbb' or '#rrggbbaa'. Opacity is a colour's " +
        "own alpha, so there is no opacity field to drift from its hue, and all three " +
        "cross-fade together over transitionMs because a cue crossing is one visual event.",
    )
    // The object's own default, built from the three arguments rather than retyped beside
    // them. A field default alone does not fill an ABSENT object, so the object needs one too
    // — and writing it out would mean every colour appearing twice, three lines apart, with
    // nothing to catch the day one of the pair is edited and the other is not.
    .default({ color, background, borderColor });

/**
 * A four-sided value in **percent of the slot**, each side measured against its own axis:
 * `top`/`bottom` against slot height, `left`/`right` against slot width.
 *
 * **No `number | object` shorthand.** A union of a scalar and an object does not survive the
 * mirror to C# (README, "Two shapes do not survive"), and per-side defaults already let an
 * author write only the side they are changing.
 */
const sides = (value: number, what: string, whole: string) =>
  z
    .strictObject({
      top: z
        .number()
        .min(0)
        .default(value)
        .describe(`${what} at the top, in percent of slot HEIGHT.`),
      right: z
        .number()
        .min(0)
        .default(value)
        .describe(`${what} at the right, in percent of slot WIDTH.`),
      bottom: z
        .number()
        .min(0)
        .default(value)
        .describe(`${what} at the bottom, in percent of slot HEIGHT.`),
      left: z
        .number()
        .min(0)
        .default(value)
        .describe(`${what} at the left, in percent of slot WIDTH.`),
    })
    .describe(whole)
    // Built from the one argument, for stageColors' reason: an absent object needs its own
    // default, and retyping the value four more times beside the four field defaults is five
    // chances for one of them to drift.
    .default(allSides(value));

/**
 * One face's geometry (mtngtools/mtng-dotnet-mono#434, spec §The face).
 *
 * **Geometry follows the face, not the stage.** There are two faces — the running countdown,
 * which all four escalation stages share, and the cleared clock — so a cue crossing changes
 * colour and never moves the digits, and nothing animates a layout property.
 *
 * **Units are percent of the slot**, which is what makes one number hold on a confidence
 * monitor and on a video wall. `cornerRadius` is the one value with no side, so it measures
 * against the **shorter** side; `50` is a pill and anything above it clamps there, in the
 * shared ViewModel, so neither head invents a maximum of its own.
 *
 * **The two faces share every nested default deliberately.** The C# mirror names a nested
 * object after its own property rather than its full path, so `padding` under both faces emits
 * a single `WindowSlotContentPadding` — sound only while the two are structurally identical.
 * Giving one face a different padding default would emit two `partial` halves of one class
 * with duplicate members and fail the .NET build. Only the face's own description differs
 * between the two calls, which is scoped to `WindowSlotContentGeometry` and
 * `WindowSlotContentClearedGeometry` and so collides with nothing.
 */
const faceGeometry = (face: string) => {
  // The three defaults, named once and spent twice — on the fields, and on the object's own
  // default, which is what fills an ABSENT face. Both faces take this one set, which is the
  // structural equality the note above says the .NET build depends on.
  const padding = 6;
  const borderThickness = 0;
  const cornerRadius = 0;

  return z
    .strictObject({
      padding: sides(
        padding,
        "The inset between the face's edge and the digits",
        "The gutter inside the face: the fill covers the whole slot, this insets what is " +
          "drawn on it, and the Viewbox scales the digits uniformly into what is left. " +
          "Four-sided, in percent of the slot, each side against its own axis — top and " +
          "bottom against height, left and right against width. This is the one meaning of " +
          "the inset both heads implement; neither keeps a margin of its own.",
      ),
      borderThickness: sides(
        borderThickness,
        "The rim's thickness",
        "The rim's thickness, drawn inside the fill's edge in the stage's borderColor. " +
          "Four-sided, in percent of the slot, each side against its own axis — top and " +
          "bottom against height, left and right against width. Zero on every side by " +
          "default, so the default face is a plain filled panel and borderColor shows " +
          "nothing until this is raised.",
      ),
      cornerRadius: z
        .number()
        .min(0)
        .default(cornerRadius)
        .describe(
          "How far the face's corners are rounded, in percent of the slot's SHORTER side — a " +
            "radius is one length applied in both axes, so the shorter side is what bounds " +
            "it. 50 is a pill; above 50 clamps to 50, in the shared ViewModel, so neither " +
            "head invents a maximum of its own. Square by default, because slots tile.",
        ),
    })
    .describe(
      `${face} All geometry is percent of the slot, so one number holds on a confidence ` +
        "monitor and on a video wall and authoring it needs no knowledge of the Viewbox. " +
        "Geometry follows the FACE rather than the stage, which is what stops a cue crossing " +
        "from moving the digits: colour changes, geometry does not.",
    )
    .default({
      padding: allSides(padding),
      borderThickness: allSides(borderThickness),
      cornerRadius,
    });
};

/**
 * The `timer` member's config — the timer component's whole configurable surface
 * (mtngtools/mtng-dotnet-mono#276, reshaped by #434; spec `MtngTools.Core.UI.TimerComponent`).
 *
 * **A per-stage palette and per-face geometry**, replacing the five flat colour scalars #276
 * shipped. A breaking change, taken because the palette became triples and flat scalars can
 * only group by naming convention — and because the stage hue moved from the digits to the
 * fill, which is a different look, not a different spelling.
 *
 * **What the clock shows past zero is configuration** (mtngtools/mtng-dotnet-mono#489):
 * `overMode` and `overByText`, not an inference from the cue set. Cues select a colour and the
 * clock determines the numerals, one direction only — the alternative shipped once, gating the
 * overtime display on the `over` *stage*, and left a timer past its deadline showing a calm
 * `00:00` forever whenever no `over` cue was authored.
 *
 * Every field has a `.default()`, so `{ contentType: 'timer', timer: {} }` is still a fully
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
    none: stageColors(
      "#101418ff",
      "#43a047ff",
      "#101418ff",
      "none",
      "what shows before any cue family has fired — a green panel carrying near-black digits",
    ),
    warn: stageColors(
      "#101418ff",
      "#ffb300ff",
      "#101418ff",
      "warn",
      "what shows once a 'warn'-family cue fires — an amber panel carrying near-black digits",
    ),
    timesUp: stageColors(
      "#f5f5f5ff",
      "#b23b3bff",
      "#f5f5f5ff",
      "timesUp",
      "what shows once a 'timesUp'-family cue fires — a muted-red panel carrying near-white " +
        "digits",
    ),
    over: stageColors(
      "#f5f5f5ff",
      "#b23b3bff",
      "#f5f5f5ff",
      "over",
      "what shows in overtime — the same muted red as timesUp, because the pulse rather than " +
        "a new hue is what marks overtime",
    ),
    cleared: stageColors(
      "#9e9e9eff",
      "#101418ff",
      "#9e9e9eff",
      "cleared",
      "the wall clock's own treatment, which is also the fallback of last resort before any " +
        "usable timer state has arrived — a lifecycle state rather than an escalation stage, " +
        "and the one face that stays ambient: a dark fill with grey digits",
    ),
    geometry: faceGeometry(
      "The running countdown's face, shared by all four escalation stages.",
    ),
    clearedGeometry: faceGeometry(
      "The cleared wall clock's face — the second of the two, and the only other one.",
    ),
    pulseOnOver: z
      .boolean()
      .default(true)
      .describe(
        "Whether the overtime display pulses — a subtle pulse, never a flash, and it breathes " +
          "the text alone so a translucent face never pulses what sits behind it. On by " +
          "default.",
      ),
    overMode: z
      .enum(["zero", "countUp", "countUpWithOverByText"])
      .default("countUpWithOverByText")
      .describe(
        "What the clock shows once it goes past zero. 'zero' holds 00:00; 'countUp' counts " +
          "the overrun up; 'countUpWithOverByText' counts up under the overByText label. " +
          "CONFIGURATION, NEVER A CUE: cues select a colour and the clock determines the " +
          "numerals, so a timer past its deadline counts up whether or not an 'over' cue was " +
          "ever authored. The count-up renders at the countdown's OWN size — one number at " +
          "one size across zero, so the crossing reads as a continuation rather than a mode " +
          "change; only the label is subtle. 'zero' is an author choosing a held number " +
          "deliberately.",
      ),
    overByText: z
      .string()
      .default("OVER BY")
      .describe(
        "The label above the count-up in 'countUpWithOverByText', in a subtle, blocky, short " +
          "font. Shown only BELOW zero — 00:00 is the countdown's last frame, so " +
          "'OVER BY 00:00', claiming an overrun that has not happened, is never painted. " +
          "Ignored by the other two modes.",
      ),
    transitionMs: z
      .int()
      .min(0)
      .default(300)
      .describe(
        "How long a view takes to cross-fade between stage treatments, in whole MILLISECONDS " +
          "— the unit is in the name because every other duration in this contract counts in " +
          "seconds. All three colours fade together, because a cue crossing is one visual " +
          "event. 0 switches instantly.",
      ),
  })
  .describe(
    "The timer component's config: which timer it watches, the per-stage palette of digits, " +
      "fill and rim it paints with, the per-face geometry it paints into, what it shows past " +
      "zero, and its transition effects. Present iff contentType is 'timer'.",
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
