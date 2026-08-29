import { z } from "zod";

/**
 * The closed slot-content union — what a slot can be asked to hold
 * (mtngtools/mtng-dotnet-mono#114, #64).
 *
 * A **tagged record rather than a discriminated union**, because `oneOf` does not survive the
 * mirror to C# — see the README. `contentType` is the discriminant; each non-reserved value is
 * exactly an `IComponentRegistry` key on the host side (ADR-0011) and carries its component's
 * config as an `.optional()` member field named after it, with a `.check()` enforcing the
 * present-iff-selected invariant once the first such member lands.
 *
 * **Closed on both sides of the generator:** an undeclared `contentType` fails schema
 * validation at the edge — Zod here, the mirrored single-value enum in C# — so it never
 * reaches the registry, and an experimental component cannot be addressed into a stable host
 * at runtime (ADR-0001's boundary). Adding a member later is additive; closing an open union
 * later would be breaking, so it starts shut.
 *
 * `static` is the one **reserved** value: it carries no payload and routes to the paint path —
 * the slot renders its resolved static content, never a mounted component. Content is never
 * null, so "set a slot to static content" is `{ contentType: 'static' }`, keeping the union
 * exhaustive with no null-vs-absent ambiguity. Its named extension — optional fields carrying
 * the content itself — is recorded in the MTWindows spec, not built.
 *
 * The first component member — the timer's config — lands with
 * mtngtools/mtng-dotnet-mono#276, extending the enum and adding its `.optional()` field.
 */
export const WindowSlotContent = z
  .strictObject({
    contentType: z
      .enum(["static"])
      .describe(
        "Which content this slot should hold. 'static' is the one reserved value — no " +
          "payload, routed to the paint path (the slot renders its resolved static content). " +
          "Every non-reserved value is exactly an IComponentRegistry key on the host side, " +
          "one name end to end. Closed: an undeclared value fails schema validation at the " +
          "edge and never reaches the registry.",
      ),
  })
  .describe(
    "A slot's desired content, discriminated on contentType. Closed: 'static' (reserved, no " +
      "payload — render the slot's resolved static content) is the only member until " +
      "component members land, each carrying its component's config. Never null — a slot " +
      "with no component mounted is set to static, not to nothing.",
  );

export type WindowSlotContent = z.infer<typeof WindowSlotContent>;
