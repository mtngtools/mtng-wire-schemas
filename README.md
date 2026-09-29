# mtng-wire-schemas

The **shared wire contract** between the mtngTOOLS TypeScript apps (`mtng-mono`) and the
.NET apps (`mtng-dotnet-mono`). One authored source, a mechanical mirror, shipped across
repos on its own version cadence. See **ADR-0005** in `mtng-dotnet-mono` for the decision.

## The rules (read before editing)

- **TypeScript (Zod v4) is the source of truth.** Schemas are authored in [`src/`](src/) as Zod.
  JSON Schema in [`schemas/`](schemas/) is **generated**, never hand-edited. C# on the .NET side
  is a mechanical, drift-proof mirror regenerated from the emitted JSON Schema — **pure .NET, no
  Node** on .NET build agents.
- **This contract carries its own `0.x` semver**, independent of either consumer. Breaking
  changes are OK pre-1.0. **Consumers adopt on their own cadence** by bumping the submodule
  pointer — never automatically.
- **Consumers pin this repo as a git submodule.** Both `mtng-mono` (TS) and `mtng-dotnet-mono`
  (.NET) vendor a fixed commit; upgrading the contract is a deliberate pointer bump, reviewed
  like any other change.
- **Every message is authored here; only *export* is opt-in.** A message is authored in Zod
  under [`src/messages/`](src/messages/) and mirrored into C# whether or not anything exports
  it — `npm run generate` walks the message modules, not the barrel. What
  [`src/index.ts`](src/index.ts) decides is which types reach **TypeScript consumers**: default
  single-language, and the dual surface stays small and intentional.
  - **These were one rule and are now two** (mtng-dotnet-mono ADR-0026, which amends ADR-0005's
    scope clause). Fusing them meant a message the barrel did not name had no schema and so had
    to be hand-authored in C#, outside the drift gate — which is how four such types
    accumulated. Authorship is universal; export is curated.

This repo is **self-contained** — it depends on no consumer and is deliberately not chained to
either mono's build. (Same discipline as the `stable` / `experimental` areas in
`mtng-dotnet-mono`: own version, own rules, stated up front.)

## Layout

```
mtng-wire-schemas/
  src/                       # Zod v4 source of truth (authored)
    index.ts                 #   the EXPORT allow-list: which messages TS consumers receive
    shared/                  #   VOCABULARIES more than one domain assembles from — see below
      timing.ts              #     phaseCue, timerCue, timerHint, load, phaseKey, phaseBody
      meeting-data.ts        #     the entities: presentation (with its Calculated tier), speaker
      presentation-context.ts#     the groups the messages carry: presentation, session, files
    messages/                #   THE CODEGEN INPUT: every PascalCase Zod export
                             #   under here is a message and gets a schema; a
                             #   piece is camelCase and gets none
      backdrop/              #   the floor app's set: commands, events + shared pieces
      presentation/          #   the Present manager's set: the pointer + its navigation echo,
                             #   the snapshot rpc, and 6 commands (enter/exit, four goto-*)
      timer/                 #   the Timer manager's set: events, rpc, commands + shared pieces
      window/                #   the window domain, whole: the slot-content trio, the
                             #   sugar verbs and named-state pair, the reports, the
                             #   config-carrying commands (set-window, patch-window,
                             #   set-bounds), close, and the snapshot rpc + state
                             #   document; config.ts holds the dialect they share
  schemas/                   # emitted JSON Schema (GENERATED — do not hand-edit)
    <message>.schema.json    #   one file per authored message
  scripts/generate.mjs       # the emitter: src/messages/ (Zod) -> schemas/ (JSON Schema)
  tests/                     # the suite: every .check(), the emitted schemas as the mirror
                             #   reads them — plain node, `npm test`
  package.json               # Zod SoT + `generate` / `typecheck` / `test` / `check` scripts
```

### `src/shared/` — cross-domain vocabularies

Every shape once belonged to exactly one domain and lived in that domain's `common.ts`. That is
no longer true: `presentation.state-changed` carries the timer's cue and hint vocabulary inside
the `presentation` group, `timer.state-changed` / `timer.cue-fired` carry the presentation
domain's context back out, and the `TimerPresets` document is authored in the same vocabulary a
producer puts on the wire (mtngtools/mtng-dotnet-mono#372, #378; ADR-0033).

`src/shared/` is where a **vocabulary** more than one domain assembles from lives — a module at a
time, not a shape at a time.

- **The unit is the module, not the individual export.** `timing.ts` is the presentation-timing
  vocabulary; `meeting-data.ts` is the entity vocabulary — the presentation and the speaker, as
  upstream's `PresentationFull` and `SpeakerBase` in this wire's dialect, the `mt`/`rm`/`ss`/`pr`/`sp`
  family's home as the other entities arrive; `presentation-context.ts` assembles the groups the
  messages carry from them. A module earns its place here when the domains genuinely share it,
  and everything belonging to that vocabulary then lives in it — including exports that, on any
  given day, only one domain happens to import. `timerCue` is the standing case: `phaseCue` is
  the authored cue and `timerCue` is what the timer reduces it *into*, so they are two halves of
  one concept. Only the timer domain imports the reduced half today, and splitting the pair
  across two modules to track that would file one concept in two places and invite the halves to
  drift. **Import count is evidence about a module, never a rule about an export.**
- **Not a fifth domain.** It sits *outside* `messages/` rather than beside `backdrop/`,
  `presentation/`, `timer/` and `window/`, because nothing in it is a message and nothing in it
  has a `domain` — which is a closed per-domain enum in every envelope. A folder among the
  domains would say the opposite.
- **Mutual imports were not the alternative.** Both `common.ts` files build Zod schemas at module
  top level, so importing each other is a circular *runtime* dependency in which one side
  evaluates to `undefined` depending on entry order. Duplicating the shapes was also rejected: it
  drifts, and the generator would emit two C# classes for one concept.
- **Nothing here is allow-listed.** These are pieces, and each mirrors into C# scoped to the
  message that embeds it. `WindowSlotContent` is the one non-message export, and only because it
  is a closed union the TS side has to narrow on.

### Authoring rules

- **A message is a PascalCase Zod export under `src/messages/`; a piece is camelCase.** That is
  what the emitter walks, so the convention is load-bearing rather than cosmetic — a message
  named `windowSetWindow` would silently never mirror. The export name becomes the schema file
  name (kebab-cased) *and* the C# class name, so renaming a message renames both.
- **Document fields with `.describe()`, not JSDoc.** Only `.describe()` reaches the emitted JSON
  Schema, and from there the generated C# XML doc comments.
- **A `.describe()` on a wrapper replaces the one on the schema it wraps.**
  `group.optional().describe(…)` emits only the outer text, so a shape documented where it is
  defined and described again where it is embedded ships the second and silently loses the
  first — invariants included. Document a shape once, on the shape.
- **Envelope fields (`type` / `domain` / `kind`) use single-value `z.enum([...])`, never
  `z.literal(...)`.** `const` erases the literal on the way to C#; a one-member enum compiles it
  into the mirror. This is what keeps a routing key from drifting off its schema.
- **Two shapes do not survive the mirror to C#** — verified against NJsonSchema, not assumed:
  `z.discriminatedUnion` (emits `oneOf`, which collapses to its first branch, silently dropping
  the others) and `.nullable()` (emits `anyOf [T, null]`, which becomes a junk empty class). Use
  a tagged record with `.optional()` fields instead, and enforce the invariant with `.check()`.
- **Name a nested shape with `.meta({ title })` when it is reached more than once** — verified
  against NJsonSchema, not assumed. The mirror names an inline object after the *property* that
  holds it, and a shape with no property name at all — the value type of a `z.record(…)` — is
  named `Anonymous`. Two records in one message therefore both wanted `<Message>Anonymous`, and
  the second silently took the first's class: the window state document's `slots` came out
  typed as a static-content preset. A `title` is what NJsonSchema falls back to when there is no
  property-name hint, so it fixes that, and it emits **inline** rather than hoisting into
  `$defs` — which matters, because the .NET side requires exactly one top-level definition per
  file. A title does **not** override a property-name hint, so the same shape under a named
  property still emits its own class; that is duplication, not a defect.
- **A per-phase container is `z.partialRecord(phaseKey, value.meta({ title }))`, never
  `z.strictObject({ intro, talk, qa })`** — verified against NJsonSchema, not assumed. The JSON
  and the inferred TypeScript type are identical (`{ intro?, talk?, qa? }`, unknown keys rejected,
  and the emitted schema closes the keys with `propertyNames`), but the mirror names an inline
  object after its property: the literal form emits `…Intro`, `…Talk` and `…Qa` as three classes
  of one shape with three copies of every enum beneath them, plus orphan `…Anchor2`/`…Anchor3`
  enums where it dedupes the arrays' item class but not the item's enums — and where two per-phase
  containers of different shapes sit in one document (`TimerPresets`' presets and named sets),
  their `Intro`s merge silently. The record form emits one `IDictionary<string, T>` with one
  titled value class. `phaseKey` in `src/shared/timing.ts` is the key and carries the evidence.
- **A shape a `z.record()` reaches carries a `.meta({ title })`** — the corollary of the rule
  above: a record's value type has no property name, so without a title it is `Anonymous`, and
  two of those merge. `phaseCue` and `timerHint` are titled for this reason; under a named
  property the property still wins, so the titles change nothing on the messages.
- **`.default(…)` crosses the mirror, and it puts the field in `required`** — both verified
  against the generators, not assumed. NJsonSchema turns a schema `default` into a **C# property
  initializer** (`public string Target { get; set; } = "presentation-phase";`), so a defaulted value has
  exactly **one home — here** — instead of one copy per language, and a field absent from the JSON
  lands on that same value on the .NET side. The cost is that Zod's draft-7 emitter describes the
  **output** type, where a defaulted field is always present: it emits `default` *and* lists the
  field in `required`. That is the io-mode behavior, not a claim that senders must spell the value
  out — `.parse()` fills it in on the TS side. Prefer `.default()` over documenting a default in
  prose and re-typing it in C#.

## Generate the JSON Schema

```sh
npm install
npm run generate        # src/ (Zod) -> schemas/ (JSON Schema)
npm test                # every .check(), and the emitted schemas as the mirror reads them
npm run check           # typecheck + generate + test + assert schemas/ is not stale
```

Generated output in `schemas/` is **committed**, and each consumer guards it with
`git diff --exit-code` so a schema change that wasn't regenerated fails CI on the stale side.
`npm run check` is that guard on this side.

The suite under [`tests/`](tests/) runs on node's built-in runner with no test dependency — node
strips the TypeScript types on import, so the authored `src/*.ts` is what the tests exercise, as
it is what the emitter runs. Two kinds of test live there: every invariant a `.check()` enforces
(the mirror carries structure only, so this is the one place the invariants are proven), and the
emitted `schemas/` read the way NJsonSchema will read them — no `oneOf`, no nullable, every
object closed but the named bags, and never two differently-shaped objects under one mirror name
in one message.

The emitter is Zod v4's **native `z.toJSONSchema()`** (draft-07), not a third-party generator:
it is the only one that carries Zod's constraints through to the emitted schema, and from there
into C# — `.int()` becomes a bounded `long`, `z.iso.datetime()` a `DateTimeOffset`. It runs
under plain `node`, which strips the TypeScript types on import, so the authored `src/*.ts` is
what executes and there is no compiled copy to fall out of date.

## Versioning & releases

- Version lives in `package.json` and is mirrored by a **git tag** `vMAJOR.MINOR.PATCH`
  (`v0.1.0` first). **Tags are canonical** — that is what consumers pin.
- Pre-1.0: minor bumps may break; document breaks in the release notes.
  - **0.14.0 breaks the window configuration dialect.** Every geometry value became one object
    with optional fields and a `.check()`, so the bare-label spellings are gone: `"top"` is now
    `{ "anchor": "top" }`, `"half"` is `{ "quantity": "half" }`, `"firstHalf"` is
    `{ "ordinal": "firstHalf" }`, and `"bottomHalf"` is `{ "composite": "bottomHalf" }`. Every
    object arm — `{ index, denominator }`, `{ pixels }`, `aspectRatio` — is unchanged, and
    `OsExplicit` keeps `{ "pixels": n }`, told apart as before by `position.display` being
    absent. Nothing is deployed and no seed exists in the field, so the cost is signalling
    rather than compatibility.
- Cut a release: bump `package.json`, regenerate `schemas/`, commit, then
  `git tag vX.Y.Z && git push --tags`.
