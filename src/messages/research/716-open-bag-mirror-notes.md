# Research: does an open "properties bag" survive the Zod → JSON Schema → NJsonSchema → C# mirror?

mtngtools/mtng-dotnet-mono#716 (blocks #717, under map #713). Throwaway branch:
`research/free-form-properties-mirror`. Delete this folder before ever merging anything from
this branch back toward `main` — it exists only to leave a linkable, reproducible trail for
#716's findings.

## Method

Zod v4.4.3 (installed version, checked via `node_modules/zod/package.json` and
`node_modules/zod/v4/classic/schemas.d.ts` rather than assumed from general Zod knowledge — the
d.ts confirms `object()`, `strictObject()`, `looseObject()`, and `.catchall()` / `.passthrough()`
(deprecated alias of `.loose()`) as the v4.4.3 API surface for "may carry extra properties").

Four candidate messages were authored in `free-form.ts` (this folder), run through the real
`npm run generate` (Zod → `schemas/*.schema.json`, draft-07), then through a byte-for-byte copy
of `eng/wire-gen/generate.cs`'s settings (NJsonSchema 11.6.1, `GenerateOptionalPropertiesAsNullable`,
`MessageScopedTypeNameGenerator`) pointed at a scratch schema/out directory so the real committed
mirror under `src/stable/Core/MtngTools.Core.Wire/generated/` on `main` was never touched. A
fifth (`ResearchFreeFormRecordMemberOptional`) checks the `.optional()` case, since #717's real
field will almost certainly be omittable.

**Prior art already in this repo, found before authoring anything new:** `window/config.ts`
already uses `z.record(z.string().min(1), staticComponentConfig)` for
`staticContentPresets.named` and `z.record(z.string().min(1), WindowSlotContent…)` for
`windowDesiredState.slots` — both **fixed-value-type** dictionaries. The committed
`WindowDesiredStateChanged.g.cs` already mirrors these as
`IDictionary<string, WindowDesiredStateChangedSlotContent>` and
`IDictionary<string, WindowDesiredStateChangedStaticContentPreset>`. That confirms `z.record`
survives at all; what this research adds is the **open / unknown-value-type** case (`z.record(_,
z.unknown())`) and the **additionalProperties-on-the-object-itself** case (`looseObject` /
`.catchall`), neither of which existed anywhere in the schema set before this branch.

## Result: all four candidates survive. Two distinct, both usable, mechanisms.

| Candidate | Zod | Emitted JSON Schema | Emitted C# |
|---|---|---|---|
| A — named bag | `z.record(z.string(), z.unknown())` as an object member | `"properties": { "type": "object", "propertyNames": {"type":"string"}, "additionalProperties": {} }` | `IDictionary<string, object> Properties` (real, populated) |
| A2 — named bag, optional | same, `.optional()` | same, outside `required` | `IDictionary<string, object>? Properties` — nullable, no `[Required]`, absent stays distinguishable from empty `{}` |
| B — top-level open object | `z.looseObject({ ...fixedFields })` | the object's own `"additionalProperties": {}` (not nested under a named property) | the class keeps every fixed field **and** gains a `[JsonExtensionData] IDictionary<string, object> AdditionalProperties` |
| C — nested open group | `.catchall(z.unknown())` on a sub-object, envelope itself stays `strictObject` | same as B, but on the nested object only | the **nested** class gets the identical `JsonExtensionData`-backed `AdditionalProperties`; top-level vs nested behaves identically |
| D — whole message is the bag | `z.record(z.string(), z.unknown())` as the entire root schema, no envelope | root schema is bare `{"type":"object","additionalProperties":{}}` | NJsonSchema recognizes "no properties, only additionalProperties" and emits `public partial class ResearchFreeFormRecordWholeMessage : Dictionary<string, object> { }` — real, but not useful here since a real message needs its fixed envelope fields too |

**Nothing produced a junk/empty class and nothing failed generation.** That is a different
outcome from the two known-bad shapes already documented in the assembly spec
(`z.discriminatedUnion` collapsing to its first branch, `.nullable()` emitting an empty class
with an unpopulated `JsonExtensionData` bag) — this research does not revisit those; they are
orthogonal and already settled.

**additionalProperties: true never appears literally.** Zod v4's `z.toJSONSchema` always emits
an *empty schema* `{}` for `additionalProperties`, whether the source was `z.record(_,
z.unknown())`, `z.looseObject`, or `.catchall(z.unknown())` — never the JSON Schema boolean
`true`. NJsonSchema treats `{}` exactly like `true` (unconstrained), so this made no observed
difference to the C# output; noted only because the ticket's premise ("does `additionalProperties:
true` survive") doesn't literally occur — an empty-schema equivalent does, and it behaves the
same way.

**Top level vs nested: no behavioral difference observed.** Candidate B (open at the message's
own top level) and Candidate C (open on a nested group, envelope itself closed) produce the
identical mechanism — a `JsonExtensionData`-backed dictionary on whichever class is open — at
whichever depth it is declared.

**Value type is `object`, not `JsonElement` or `JsonNode`.** Every dictionary/extension-data
member above is typed `IDictionary<string, object>`. With `System.Text.Json`'s default object
converter, each entry deserializes at runtime as a boxed `JsonElement` — so callers reading a
bag value still need a `JsonElement`-aware cast/pattern, even though the declared type says
`object`. This is a fact for #717 to design around, not a defect in the generator.

## Actual generated C# (excerpts)

Regenerate the rest with the scratch copy of `eng/wire-gen/generate.cs` described above, pointed
at `research-free-form-*.schema.json` alongside this note, if you need the remaining classes.

Candidate A (named bag, required):

```csharp
/// <summary>
/// Open bag: host-defined keys, unknown value shape.
/// </summary>
[System.Text.Json.Serialization.JsonPropertyName("properties")]
[System.ComponentModel.DataAnnotations.Required]
public System.Collections.Generic.IDictionary<string, object> Properties { get; set; } = new System.Collections.Generic.Dictionary<string, object>();
```

Candidate A2 (named bag, optional):

```csharp
[System.Text.Json.Serialization.JsonPropertyName("properties")]
public System.Collections.Generic.IDictionary<string, object>? Properties { get; set; } = default!;
```

Candidate B (top-level `looseObject` — fixed fields plus extension data):

```csharp
public partial class ResearchFreeFormLooseTopLevel
{
    // ...Type, Domain, Kind, Ts, Name as ordinary fixed properties...

    private System.Collections.Generic.IDictionary<string, object>? _additionalProperties;

    [System.Text.Json.Serialization.JsonExtensionData]
    public System.Collections.Generic.IDictionary<string, object> AdditionalProperties
    {
        get { return _additionalProperties ?? (_additionalProperties = new System.Collections.Generic.Dictionary<string, object>()); }
        set { _additionalProperties = value; }
    }
}
```

Candidate C (nested `.catchall(z.unknown())` group — identical mechanism, one level down):

```csharp
public partial class ResearchFreeFormCatchallNestedGroup
{
    [System.Text.Json.Serialization.JsonPropertyName("label")]
    [System.ComponentModel.DataAnnotations.Required]
    public string Label { get; set; } = default!;

    private System.Collections.Generic.IDictionary<string, object>? _additionalProperties;

    [System.Text.Json.Serialization.JsonExtensionData]
    public System.Collections.Generic.IDictionary<string, object> AdditionalProperties
    {
        get { return _additionalProperties ?? (_additionalProperties = new System.Collections.Generic.Dictionary<string, object>()); }
        set { _additionalProperties = value; }
    }
}
```

Candidate D (whole message is the bag):

```csharp
public partial class ResearchFreeFormRecordWholeMessage : System.Collections.Generic.Dictionary<string, object>
{
}
```

## Handoff to #717 (facts only — not this ticket's call)

Two real, working mechanisms exist; pick between them on their own merits, not on "does it
survive" (both do):

- **`z.record(z.string(), z.unknown())` as a named field** (Candidate A/A2) — the bag lives under
  its own key (e.g. `properties`), explicit in the schema, `IDictionary<string, object>`
  (nullable when `.optional()`). Presence/absence of the *field* is distinguishable from an empty
  bag.
- **`z.looseObject(...)` / `.catchall(z.unknown())`** (Candidate B/C) — extra keys merge directly
  into the carrying object's own JSON, surfaced in C# as a `[JsonExtensionData]`
  `AdditionalProperties` dictionary alongside that object's fixed fields. Works identically
  whether the open object is the whole message or a nested group.

Neither was harder to generate than the other, and neither degrades any of the message's *own*
fixed fields — pick based on the wire shape #717 actually wants (a dedicated `properties` key
vs. flattened extra keys), not on mirror survivability.
