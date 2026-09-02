import { z } from "zod";

import { WindowSlotContent } from "./content.ts";

/**
 * The **window configuration dialect** — the shape `window.set-window` carries whole,
 * `window.patch-window` carries sparse, `window.set-bounds` carries a slice of, and
 * `window.desired-state-changed` carries one per window.
 *
 * Nothing here is a message and nothing here is exported from the allow-list barrel: these are
 * the pieces the four config-carrying messages assemble from. They live in their own module
 * rather than `common.ts` for `content.ts`'s reason — `common.ts` holds the domain's envelopes,
 * and a dialect this size filed beside them would bury both.
 *
 * ## Every geometry value is one object with optional fields and a `.check()`
 *
 * Deliberately **not** `z.discriminatedUnion` (mtng-dotnet-mono ADR-0026): it emits `oneOf`,
 * which NJsonSchema collapses to its first branch, silently dropping the rest. The shape here
 * is the one `WindowSlotContent` already uses — optional fields, with the exactly-one-arm
 * invariant enforced by a check that this side rejects on and the C# mirror cannot.
 *
 * **The price is stated rather than hidden:** the generated C# carries the structure and not
 * the invariant, so a payload with two arms deserializes on the .NET side and is caught by
 * normalization, not by the schema. That is the limitation `WindowSlotContent` runs under too.
 *
 * ## Only the bare-label arms changed
 *
 * Every object arm is byte-identical to the dialect that came before — `{ index, denominator }`,
 * `{ pixels }`, `aspectRatio` — so *relative first*, the relative arms being the default way to
 * write a config, survives untouched, along with the four label vocabularies and the
 * ordinal-versus-quantity distinction. What changed is that a label is now written in a keyed
 * object rather than as a bare string: `"top"` became `{ anchor: "top" }`.
 *
 * ## No `.default()` on a config field, and where that stops
 *
 * The repo README prefers `.default()`, because NJsonSchema mirrors a schema default into a C#
 * property initializer and the value then has one home. It does not apply to the **fields of a
 * config** — the ones `windowConfigFields` holds — twice over:
 *
 * - **Several of those defaults are per-kind** — `decorations`, `resizable`, `showInTaskbar`,
 *   `displayArea` and the display fallback all differ between a `screenWindow` and a
 *   `controlWindow`. There is no single value to write, and `WindowConfigNormalizer` is where
 *   the pairing lives.
 * - **`window.patch-window` shares those fields and is sparse by definition.** A defaulted
 *   field is always present in the parsed output, so every patch would assert every default —
 *   which is exactly the whole-config Set that patch exists as the alternative to.
 *
 * So absent stays absent for a config field, and *absent is the default* stays a rule the
 * consumer applies (MTWindows wire-messages.md §window.set-window).
 *
 * **The rule is about config fields, not about everything in this module**, and three fields
 * below are deliberately `.default()`ed because neither reason reaches them:
 *
 * - `aspectRatio.mode` and `display.index` sit **inside a value that is all-or-nothing**. An
 *   author who writes `aspectRatio` at all has written the whole ratio, and one who writes
 *   `position.display` has written the whole plan — a patch carries such a value entire or not
 *   at all, so defaulting a field within one materializes nothing a patch would wrongly
 *   assert. Neither default varies by kind, so both have exactly one home: here.
 * - A preset's `background` is not a config field at all. It belongs to the state document's
 *   `presets`, which no patch is sparse over.
 */

/**
 * The wire spelling of a geometry value that carried the wrong number of arms.
 *
 * One message shape for every value in the dialect, because an author who mixed `pixels` with
 * `quantity` on the width has made the same mistake as one who mixed them on the height, and
 * two phrasings of it would only be two things to read.
 */
const armViolation = (present: readonly string[], arms: string): string | null => {
  if (present.length === 1) {
    return null;
  }

  return present.length === 0
    ? `write exactly one of ${arms}`
    : `exactly one of ${arms} — got ${present.join(" and ")}`;
};

/** Which of a value's arm markers the author actually wrote. */
const armsPresent = (markers: Record<string, unknown>): string[] =>
  Object.entries(markers)
    .filter(([, value]) => value !== undefined)
    .map(([name]) => name);

/**
 * The **ordinal** vocabulary — sugar for a slice, one label per `{ index, denominator }` pair
 * up to fifths.
 *
 * An ordinal names *which* slice: `firstHalf` is `{ index: 1, denominator: 2 }`, `thirdQuarter`
 * is `{ index: 3, denominator: 4 }`. Kept distinct from the quantity vocabulary below because
 * "the third quarter" and "three quarters" are different things and a config that confused them
 * would be silently wrong rather than rejected.
 */
const ordinalLabel = z.enum([
  "firstHalf",
  "secondHalf",
  "firstThird",
  "secondThird",
  "thirdThird",
  "firstQuarter",
  "secondQuarter",
  "thirdQuarter",
  "fourthQuarter",
  "firstFifth",
  "secondFifth",
  "thirdFifth",
  "fourthFifth",
  "fifthFifth",
]);

/**
 * The **quantity** vocabulary — sugar for a fraction, one label per `{ numerator, denominator }`
 * pair up to fifths, plus `full`.
 *
 * A quantity names *how much*: `half` is `{ numerator: 1, denominator: 2 }`, `threeQuarters` is
 * `{ numerator: 3, denominator: 4 }`. Sizes speak this; offsets speak ordinals.
 */
const quantityLabel = z.enum([
  "half",
  "oneThird",
  "twoThirds",
  "oneQuarter",
  "threeQuarters",
  "oneFifth",
  "twoFifths",
  "threeFifths",
  "fourFifths",
  "full",
]);

/**
 * One axis of a window's **position**, in the native tail's own unit — physical device pixels
 * on Windows, points on macOS (MTWindows spec §Units).
 *
 * Four arms, exactly one of them written. Offsets measure from the reference rectangle's
 * origin, and the two axes are freely mixed — relative on one, explicit on the other.
 *
 * `anchor` is the only arm that reads the *size*: "100px wide, pinned right" is expressible at
 * no denominator, which is what the anchor vocabulary is for. It is also why the anchor words
 * differ per axis, and so why `x` and `y` are two schemas rather than one.
 */
const axisOffset = <TAnchor extends string>(
  anchors: readonly [TAnchor, ...TAnchor[]],
  axis: string,
) =>
  z
    .strictObject({
      pixels: z
        .int()
        .optional()
        .describe(
          "A fixed offset from the reference rectangle's origin, in the native tail's unit. " +
            "With no position.display beside it this is the OsExplicit arm — an absolute " +
            "virtual-desktop coordinate — which is the spelling a program reporting a " +
            "measured rectangle writes.",
        ),
      index: z
        .int()
        .min(1)
        .optional()
        .describe(
          "Which slice, 1-based: origin = floor((index − 1) × extent ÷ denominator). Written " +
            "with denominator, never alone. { index: 3, denominator: 4 } is the third quarter " +
            "— an origin at 50%.",
        ),
      denominator: z
        .int()
        .min(1)
        .optional()
        .describe("How many slices the extent is divided into. Written with index, never alone."),
      ordinal: ordinalLabel
        .optional()
        .describe(
          "A slice named rather than counted — pure sugar, expanded at parse, so a config " +
            "spelled with labels is value-equal to the same config spelled with numbers and " +
            "lands on the diff's no-op. 'firstHalf' is { index: 1, denominator: 2 }.",
        ),
      anchor: z
        .enum(anchors)
        .optional()
        .describe(
          `Where on the ${axis} axis to pin the window — the only arm that reads the size, ` +
            "which is what makes '100px wide, pinned to the end' expressible at no " +
            "denominator. The words differ per axis so a config reads as prose.",
        ),
    })
    .check((ctx) => {
      const { pixels, index, denominator, ordinal, anchor } = ctx.value;

      const problem = armViolation(
        armsPresent({ pixels, slice: denominator, ordinal, anchor }),
        "pixels, { index, denominator }, ordinal, anchor",
      );

      if (problem !== null) {
        ctx.issues.push({ code: "custom", input: ctx.value, path: [], message: problem });
      }

      if ((index === undefined) !== (denominator === undefined)) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: [index === undefined ? "index" : "denominator"],
          message: "the slice arm is { index, denominator } — both, or neither",
        });
      }
    });

/**
 * Both axes say the same thing, so they say it once: the arms differ only in the anchor words,
 * which the per-axis enum already carries.
 */
const offsetDescription =
  "One axis of a window's position: a fixed offset, a slice of the reference rectangle, an " +
  "ordinal label naming that slice, or an anchor. Exactly one arm — enforced here, and " +
  "carried as structure alone into the C# mirror, which has no check to emit.";

/** The X axis of a position: anchors read left to right. */
const windowOffsetX = axisOffset(["left", "center", "right"], "X")
  .meta({ title: "PositionX" })
  .describe(offsetDescription);

/** The Y axis of a position: anchors read top to bottom. */
const windowOffsetY = axisOffset(["top", "center", "bottom"], "Y")
  .meta({ title: "PositionY" })
  .describe(offsetDescription);

/**
 * One axis of a window's **size**, in the native tail's own unit.
 *
 * Three arms, exactly one written. Sizes describe the **outer** rectangle, chrome included, so
 * toggling decorations preserves what was authored.
 */
const windowSizeAxis = z
  .strictObject({
    pixels: z
      .int()
      .min(0)
      .optional()
      .describe("A fixed extent in the native tail's unit, chrome included."),
    numerator: z
      .int()
      .min(1)
      .optional()
      .describe(
        "How many parts of the extent, written with denominator. Absent means 1, so " +
          "{ denominator: 2 } is half — deliberately not a schema default, because a default " +
          "is always present in the parsed output and would then read as a second arm beside " +
          "pixels.",
      ),
    denominator: z
      .int()
      .min(1)
      .optional()
      .describe(
        "How many parts the extent is divided into: size = ceil(numerator × extent ÷ " +
          "denominator). A quantity, not an ordinal — { numerator: 3, denominator: 4 } is " +
          "three quarters.",
      ),
    quantity: quantityLabel
      .optional()
      .describe(
        "A fraction named rather than counted — pure sugar, expanded at parse. 'half' is " +
          "{ numerator: 1, denominator: 2 }; 'full' is the whole extent.",
      ),
  })
  .check((ctx) => {
    const { pixels, numerator, denominator, quantity } = ctx.value;

    const problem = armViolation(
      armsPresent({ pixels, fraction: denominator, quantity }),
      "pixels, { numerator?, denominator }, quantity",
    );

    if (problem !== null) {
      ctx.issues.push({ code: "custom", input: ctx.value, path: [], message: problem });
    }

    if (numerator !== undefined && denominator === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["numerator"],
        message: "numerator is written with denominator — a numerator alone has no extent",
      });
    }
  })
  .meta({ title: "SizeAxis" })
  .describe(
    "One axis of a window's size, outer rectangle and chrome included: a fixed extent, a " +
      "fraction of the reference rectangle, or a quantity label naming that fraction. Exactly " +
      "one arm — enforced here, and carried as structure alone into the C# mirror.",
  );

/**
 * The aspect ratio: one field, three modes.
 *
 * **Never a union**, so it is unchanged by the dialect. `fit` consumes the size fields as a
 * bounding box and cannot overflow, which is why it is the default; the derive modes make one
 * axis authoritative and can.
 */
const windowAspectRatio = z
  .strictObject({
    horizontal: z.int().min(1).describe("The ratio's horizontal term — the 16 of 16:9."),
    vertical: z.int().min(1).describe("The ratio's vertical term — the 9 of 16:9."),
    mode: z
      .enum(["fit", "fromWidth", "fromHeight"])
      .default("fit")
      .describe(
        "How the ratio is applied. 'fit' treats the size fields as a bounding box and cannot " +
          "overflow it — hence the default. 'fromWidth' and 'fromHeight' make one axis " +
          "authoritative and derive the other, which can overflow and is reported on " +
          "window.bounds-overflowed rather than clamped.",
      ),
  })
  .meta({ title: "AspectRatio" })
  .describe(
    "Constrain the window to a ratio. Not a union and so untouched by the dialect change — " +
      "it has always been one object with three fields.",
  );

/**
 * The **composite** shortcut: nine whole-bounds labels, each expanding to all four geometry
 * fields.
 *
 * One arm, so no check — but still an object, because the dialect has no bare-label arms left
 * anywhere and one exception would be the thing every author trips on.
 *
 * Deliberately closed at halves and quarters, where the combinatorics start; anything past this
 * set is written the long way, which stays fully expressive. `centered` is not a member —
 * centring needs a size, so it is an anchor.
 */
export const windowBounds = z
  .strictObject({
    composite: z
      .enum([
        "fullScreen",
        "topHalf",
        "bottomHalf",
        "leftHalf",
        "rightHalf",
        "topLeftQuarter",
        "topRightQuarter",
        "bottomLeftQuarter",
        "bottomRightQuarter",
      ])
      .describe(
        "Which whole-bounds shortcut. Each expands to all four geometry fields, which is why " +
          "a composite beside any of them — or beside aspectRatio — is rejected on " +
          "window.config-rejected rather than merged.",
      ),
  })
  .meta({ title: "CompositeBounds" })
  .describe(
    "A whole-bounds shortcut, replacing position and size together by expanding to all four " +
      "geometry fields at once. Tolerates no other geometry — written beside either of them " +
      "or beside aspectRatio it is rejected on window.config-rejected, because it already " +
      "says what they would say. The rejection, not a precedence rule, is what settles that.",
  );

/**
 * The **display plan** — resolved against whatever hardware is present, never a stored
 * identifier.
 *
 * A config that named a panel would be a config that stopped working when somebody replugged a
 * cable. A plan re-resolves, and when it cannot be satisfied the fallback chain lands the
 * window somewhere and `window.display-unsatisfied` says so.
 */
const windowDisplaySelection = z
  .strictObject({
    mode: z
      .enum(["primary", "all", "other", "fromLeft", "fromTop"])
      .describe(
        "How to choose a display. 'primary' is the OS's; 'other' is any display that is not " +
          "primary; 'fromLeft' and 'fromTop' count along the arrangement, taking index; " +
          "'all' spans them.",
      ),
    index: z
      .int()
      .min(1)
      .default(1)
      .describe(
        "Which display the counting modes land on, 1-based. Ignored by 'primary' and 'all'. " +
          "An index past the list is unsatisfiable and takes the fallback.",
      ),
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
      .optional()
      .describe(
        "Where an unsatisfiable plan lands. Absent takes the kind default — offscreen for a " +
          "screenWindow, lastOther for a controlWindow — which is why this is not defaulted " +
          "here: the value depends on a field beside it. 'offscreen' resolves to no display " +
          "at all, a computed position beyond the rightmost one.",
      ),
  })
  .meta({ title: "DisplaySelection" })
  .describe(
    "The window's display plan, resolved continuously against present hardware. A config " +
      "stores this and never a display identifier, so an arrangement change re-resolves " +
      "rather than silently pointing at the wrong panel. Its presence is also what makes a " +
      "position display-anchored: absent with { pixels } offsets is the OsExplicit arm, and " +
      "absent with any other offset anchors to the default plan, primary.",
  );

/**
 * `position` — the display plan, the area within it, and the two axes.
 *
 * **`display` present means display-anchored.** Bare `{ pixels }` on `x`/`y` with no `display`
 * is the OsExplicit arm: absolute virtual-desktop coordinates, mixing with nothing. That
 * absence is the whole discriminant, and it is the only one — the bare-number spelling the old
 * dialect used for the same arm is gone.
 */
export const windowPosition = z
  .strictObject({
    display: windowDisplaySelection.optional(),
    displayArea: z
      .enum(["full", "workingArea"])
      .optional()
      .describe(
        "Which rectangle of the resolved display to measure against. Absent takes the kind " +
          "default — full for a screenWindow, workingArea for a controlWindow — so it is not " +
          "defaulted here.",
      ),
    x: windowOffsetX.optional(),
    y: windowOffsetY.optional(),
  })
  .meta({ title: "Position" })
  .describe(
    "Where the window sits: the display plan it anchors to, the area of that display it " +
      "measures against, and one offset per axis. An absent axis starts at the reference " +
      "rectangle's origin.",
  );

/** `size` — the two axes and the ratio. An absent axis is the reference rectangle's full extent. */
export const windowSize = z
  .strictObject({
    width: windowSizeAxis.optional(),
    height: windowSizeAxis.optional(),
    aspectRatio: windowAspectRatio.optional(),
  })
  .meta({ title: "Size" })
  .describe(
    "How big the window is: one extent per axis plus an optional ratio. An absent axis is " +
      "the reference rectangle's full extent, so a config with no size at all is fullscreen.",
  );

/**
 * A reference to a room-level static content preset, by name.
 *
 * **Whole-cloth, not a base to tweak**: on the wire it is `{ preset }` and nothing else.
 * Fields written beside it are the preset-plus-fields rejection, reported on
 * `window.config-rejected` rather than merged.
 */
const staticContentReference = z
  .strictObject({
    preset: z
      .string()
      .min(1)
      .describe(
        "The preset's room-level name, resolved against the presets travelling in the same " +
          "state document. An undefined name is rejected on window.config-rejected — which " +
          "is why the presets ride the document rather than arriving separately.",
      ),
  })
  .meta({ title: "StaticContentReference" })
  .describe(
    "Name a room-level static content preset — at slot level, where it overrides, or at " +
      "window level, where it is the fallback for every slot that does not. Resolution is " +
      "slot, then window, then the system default preset. A reference is whole-cloth: the " +
      "preset is used as authored, never merged with fields written beside it.",
  );

/**
 * `layout` — what the window shows, and where configuration stops.
 *
 * A layout carries slot **ids** and slot-level static-content overrides. It never carries slot
 * **contents**: `window.set-slot-content` is the single path to those, and the state document
 * pairs them beside a config rather than inside it.
 */
const windowLayout = z
  .strictObject({
    type: z
      .enum(["fill"])
      .describe(
        "Which layout. One member today — 'fill', a single slot filling the window. Closed, " +
          "and adding a layout later is additive.",
      ),
    slots: z
      .array(
        z
          .strictObject({
            slotId: z
              .string()
              .min(1)
              .describe("This slot's id within the layout, as window.set-slot-content addresses it."),
            staticContent: staticContentReference.optional(),
          })
          .meta({ title: "LayoutSlot" }),
      )
      .describe(
        "The slots this layout defines. A list even though only the single-slot fill layout " +
          "is specified, so multi-slot layouts stay additive rather than a wire reshape.",
      ),
  })
  .meta({ title: "Layout" })
  .describe(
    "The window's layout: which slots exist and what they paint when nothing is mounted. " +
      "Configuration stops here — a layout never carries a slot's content. Absent from a " +
      "config it asserts the fill layout with its one slot, 'main', so a config carrying " +
      "nothing but an id is still a window something can be shown in.",
  );

/**
 * Every field of a window configuration **except its identity**.
 *
 * Spread rather than composed, so `window.set-window` can require `windowId` and
 * `window.patch-window` can omit it entirely without either restating the dialect. A patch has
 * no identity field because the target segment already names the window, and identity is not
 * something a patch may change.
 */
const windowConfigFields = {
  kind: z
    .enum(["screenWindow", "controlWindow"])
    .optional()
    .describe(
      "What the window is for. A screenWindow is audience-facing — frameless, no taskbar " +
        "entry, nothing minimizes it. A controlWindow is the operator's — OS-decorated and " +
        "in the taskbar. Absent asserts screenWindow, and a Set that changes this on an " +
        "existing window is rejected: the kind decides too many defaults to switch under a " +
        "window that already holds mounted components.",
    ),
  visible: z
    .boolean()
    .optional()
    .describe(
      "Whether the window is shown. Absent asserts true. Hiding keeps every component " +
        "mounted — no unmount, no state loss — which is what makes window-swap a first-class " +
        "alternative to swapping a slot's contents.",
    ),
  topMost: z
    .boolean()
    .optional()
    .describe("Whether the window stays above others. Absent asserts false."),
  clickThrough: z
    .boolean()
    .optional()
    .describe(
      "Whether the pointer passes through the window to whatever is behind it. Absent " +
        "asserts false. True cannot coexist with pointer-dependent chrome — the contradiction " +
        "is rejected on window.config-rejected rather than resolved by precedence.",
    ),
  transparent: z
    .boolean()
    .optional()
    .describe(
      "Whether the window's background can carry alpha. Absent asserts false, and resolved " +
        "static content with alpha below opaque in a window that is not transparent is " +
        "rejected — an author asking for translucency the window cannot show.",
    ),
  decorations: z
    .enum(["none", "system"])
    .optional()
    .describe(
      "Whether the OS draws a frame. Absent takes the kind default — none for a " +
        "screenWindow, system for a controlWindow. Geometry is the outer rectangle either " +
        "way, so toggling this preserves the bounds.",
    ),
  resizable: z
    .boolean()
    .optional()
    .describe("Whether the operator may resize the window. Absent takes the kind default."),
  showInTaskbar: z
    .boolean()
    .optional()
    .describe("Whether the window appears in the taskbar. Absent takes the kind default."),
  windowState: z
    .enum(["normal", "minimized", "maximized"])
    .optional()
    .describe(
      "The window's minimized/maximized state. Absent asserts normal. Nothing minimizes a " +
        "screenWindow; this is here for the operator's window, which the OS also drives.",
    ),
  position: windowPosition.optional(),
  size: windowSize.optional(),
  bounds: windowBounds.optional(),
  layout: windowLayout.optional(),
  staticContent: staticContentReference.optional(),
};

/**
 * The **complete** window configuration — never a patch.
 *
 * A patch has no fixed point and cannot be idempotently re-asserted, and re-assertion is
 * routine here: recovery replay, late-joiner pulls, a state document arriving unchanged.
 * Creation and reconfiguration are therefore the same message — the engine diffs against the
 * current config and applies only what changed, so a window is never recreated for a config
 * change and never loses the components it holds.
 *
 * **Absent is the default, and defaults are real values.** A field omitted here asserts that
 * field's default, kind defaults included — not "keep whatever it was". Zero config beyond
 * `windowId` is a frameless, fullscreen-on-primary screenWindow with the fill layout and its
 * one slot `main`.
 */
export const windowConfig = z
  .strictObject({
    windowId: z
      .string()
      .min(1)
      .regex(
        /^[a-z0-9-]+$/,
        "a windowId is lowercase letters, digits and hyphens — it is an AMQP topic segment",
      )
      .describe(
        "The window's identity — authored by whoever writes the config, never generated, and " +
          "the authoritative one: a target segment naming anything else is rejected. " +
          "AMQP-topic-safe [a-z0-9-], because it is a routing key segment; there is no " +
          "identity beyond the string.",
      ),
    ...windowConfigFields,
  })
  .meta({ title: "Config" })
  .describe(
    "A window's complete configuration, exactly as authored. Never a patch: an omitted field " +
      "asserts that field's default rather than preserving the current value, which is what " +
      "makes a Set idempotently re-assertable — and re-assertion is routine here.",
  );

/**
 * A **sparse** subset of the same configuration — the shape `window.patch-window` carries.
 *
 * Every field optional and none defaulted, so a field the author left out is a field the
 * Manager leaves alone. That is the whole difference from a Set, and it is why these fields are
 * spread from one definition rather than restated: a patch that spelled a field differently
 * from the Set that field belongs to would be a second dialect.
 *
 * **No `windowId`** — the target segment names the window, and identity is not patchable.
 */
export const windowConfigPatch = z
  .strictObject(windowConfigFields)
  .meta({ title: "ConfigPatch" })
  .describe(
    "A sparse subset of a window's configuration: the fields written are the fields changed, " +
      "and everything absent is left as stored. The same spellings a complete config uses — " +
      "there is one dialect, not a patch dialect beside it.",
  );

/**
 * One static content preset: what a slot or window paints when no component is mounted.
 *
 * A **tagged record rather than a discriminated union**, for the dialect's reason — `oneOf`
 * does not survive the mirror. `type` is the discriminant and the image arm's fields sit beside
 * it, present iff selected, which the check below enforces and the C# mirror cannot.
 */
const staticComponentConfig = z
  .strictObject({
    type: z
      .enum(["solid", "image"])
      .describe(
        "Which preset this is. 'solid' is the background alone; 'image' paints an asset over " +
          "it, and the background is what shows through and what remains if the asset cannot " +
          "be resolved.",
      ),
    background: z
      .string()
      .regex(
        /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
        "a colour is '#rrggbb' or '#rrggbbaa' — the leading '#' is required",
      )
      .default("#000000ff")
      .describe(
        "The fill, '#rrggbb' or '#rrggbbaa'. Alpha below opaque needs a transparent window; " +
          "in one that is not, the pairing is rejected on window.config-rejected. Written as " +
          "a string rather than a packed integer because nothing decides byte order for an " +
          "integer, and the two readings differ by a channel.",
      ),
    image: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The asset to paint, relative to the configured assets root. Present iff type is " +
          "'image'. A reference that cannot become an image — missing, outside the root, " +
          "undecodable, animated — degrades to the background and reports on " +
          "window.asset-unresolved; it is not a rejection, because a config valid on seven " +
          "machines and broken on the eighth is a runtime fact.",
      ),
    fit: z
      .enum(["contain", "cover", "stretch"])
      .optional()
      .describe(
        "How the image fills its rectangle. 'contain' fits it whole, 'cover' fills and crops, " +
          "'stretch' distorts. Absent asserts 'contain'. Present only on the image arm.",
      ),
    align: z
      .strictObject({
        x: z.enum(["center", "left", "right"]).describe("Horizontal alignment within the rectangle."),
        y: z.enum(["center", "top", "bottom"]).describe("Vertical alignment within the rectangle."),
      })
      .meta({ title: "ImageAlign" })
      .optional()
      .describe(
        "Where the image sits when it does not fill the rectangle — which is every case but " +
          "'stretch'. Absent asserts centred on both axes. Present only on the image arm.",
      ),
  })
  .check((ctx) => {
    const { type, image, fit, align } = ctx.value;

    if (type === "image" && image === undefined) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["image"],
        message: "type 'image' names an asset",
      });
    }

    if (type !== "image") {
      for (const [field, value] of Object.entries({ image, fit, align })) {
        if (value !== undefined) {
          ctx.issues.push({
            code: "custom",
            input: ctx.value,
            path: [field],
            message: `only type 'image' carries ${field}`,
          });
        }
      }
    }
  })
  .meta({ title: "StaticContentPreset" })
  .describe(
    "A static content preset — what paints when no component is mounted. Discriminated on " +
      "type: 'solid' is the background alone, 'image' paints an asset over it and carries the " +
      "image fields beside the discriminant, present iff selected.",
  );

/**
 * The room's static content presets, asserted whole alongside the windows they brand.
 *
 * **They travel in the state document because a rung that cannot brand a room is barely a
 * rung.** A window naming an undefined preset is rejected, so presets arriving separately would
 * mean a seed saying `staticContent: { preset: "brand" }` is rejected at every offline boot —
 * and offline is exactly what the local rungs are for. Carrying them here makes a document
 * self-sufficient: a room's whole appearance in one file, bootable with no Manager and no
 * broker.
 */
export const staticContentPresets = z
  .strictObject({
    named: z
      .record(z.string().min(1), staticComponentConfig)
      .optional()
      .describe(
        "The presets a config may name, by their room-level names. A window or slot naming a " +
          "key absent from here is rejected on window.config-rejected — a check only " +
          "possible because the presets and the configs that reference them travel in one " +
          "document.",
      ),
    systemDefault: staticComponentConfig.optional(),
  })
  .meta({ title: "StaticContentPresets" })
  .describe(
    "The room's static content presets: the named ones a config may reference, and the " +
      "systemDefault that paints where nothing else resolves — the last step of slot, then " +
      "window, then this. An absent systemDefault asserts an opaque black solid, so there " +
      "is always something to paint, and an absent presets object asserts both defaults, so " +
      "a document need not restate them to say nothing about them.",
  );

/**
 * One window in a state document: its complete configuration, and what its slots should show.
 *
 * **The slots sit beside the config, never inside it.** Configuration stops at the layout — a
 * layout carries slot ids and static-content overrides and never slot contents, because
 * `window.set-slot-content` is the single path to a slot's content. This pairs the two without
 * merging them, which is what lets one configuration spelling serve the wire and the startup
 * ladder's own documents alike.
 */
export const windowDesiredState = z
  .strictObject({
    config: windowConfig,
    slots: z
      .record(z.string().min(1), WindowSlotContent.meta({ title: "SlotContent" }))
      .optional()
      .describe(
        "Desired content per slot id. A slot the document does not mention is left alone — " +
          "the document asserts the contents it names, and the layout decides which slots " +
          "exist. Absent asserts no contents at all.",
      ),
  })
  .describe(
    "One window's desired state: the complete configuration, and the desired content of the " +
      "slots its layout defines.",
  );
