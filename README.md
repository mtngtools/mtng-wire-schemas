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
- **Dual-language is opt-in via an explicit allow-list.** A message crosses the language boundary
  *only* if it is exported from [`src/index.ts`](src/index.ts). Default is single-language; the
  dual surface stays small and intentional.

This repo is **self-contained** — it depends on no consumer and is deliberately not chained to
either mono's build. (Same discipline as the `stable` / `experimental` areas in
`mtng-dotnet-mono`: own version, own rules, stated up front.)

## Layout

```
mtng-wire-schemas/
  src/                       # Zod v4 source of truth (authored)
    index.ts                 #   the allow-list: only messages exported here are dual-language
    shared/                  #   VOCABULARIES more than one domain assembles from — see below
      timing.ts              #     phaseCue, timerCue, timerHint, load
      presentation-context.ts#     the SelfContained dialect's block/session/timer/files groups
    messages/                #   one file per message contract, or one folder per domain
      backdrop/              #   the floor app's set: commands, events + shared pieces
      presentation/          #   the Present manager's set: the pointer + its navigation echo,
                             #   the snapshot rpc, and 6 commands (enter/exit, four goto-*)
      timer/                 #   the Timer manager's set: events, rpc, commands + shared pieces
      window/                #   the window domain's dual slices: the slot-content trio, the
                             #   configuration surface's simple messages (hide/show,
                             #   apply-state/clear, config-rejected), asset-unresolved + the
                             #   placement verdicts (display-unsatisfied, bounds-overflowed)
  schemas/                   # emitted JSON Schema (GENERATED — do not hand-edit)
    <message>.schema.json    #   one file per allow-listed message
  scripts/generate.mjs       # the emitter: src/ (Zod) -> schemas/ (JSON Schema)
  package.json               # Zod SoT + `generate` / `typecheck` / `check` scripts
```

### `src/shared/` — cross-domain vocabularies

Until the `SelfContained` presentation dialect landed, every shape belonged to exactly one domain
and lived in that domain's `common.ts`. That is no longer true: `presentation.state-changed`
carries the timer's cue and hint vocabulary, and `timer.state-changed` / `timer.cue-fired` carry
the presentation domain's context back out (mtngtools/mtng-dotnet-mono#372, #378, ADR-0024).

`src/shared/` is where a **vocabulary** more than one domain assembles from lives — a module at a
time, not a shape at a time.

- **The unit is the module, not the individual export.** `timing.ts` is the presentation-timing
  vocabulary; `presentation-context.ts` is the `SelfContained` dialect's groups. A module earns
  its place here when the domains genuinely share it, and everything belonging to that vocabulary
  then lives in it — including exports that, on any given day, only one domain happens to import.
  `timerCue` is the standing case: `phaseCue` is the authored cue and `timerCue` is what the timer
  reduces it *into*, so they are two halves of one concept. Only the timer domain imports the
  reduced half today (mtngtools/mtng-dotnet-mono#382 moved the authored half into the group), and
  splitting the pair across two modules to track that would file one concept in two places and
  invite the halves to drift. **Import count is evidence about a module, never a rule about an
  export.**
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

- **Every allow-listed export is a Zod schema with a PascalCase name.** The export name becomes
  the schema file name (kebab-cased) *and* the C# class name — renaming an export renames both.
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

## Generate the JSON Schema

```sh
npm install
npm run generate        # src/ (Zod) -> schemas/ (JSON Schema)
npm run check           # typecheck + generate + assert schemas/ is not stale
```

Generated output in `schemas/` is **committed**, and each consumer guards it with
`git diff --exit-code` so a schema change that wasn't regenerated fails CI on the stale side.
`npm run check` is that guard on this side.

The emitter is Zod v4's **native `z.toJSONSchema()`** (draft-07), not a third-party generator:
it is the only one that carries Zod's constraints through to the emitted schema, and from there
into C# — `.int()` becomes a bounded `long`, `z.iso.datetime()` a `DateTimeOffset`. It runs
under plain `node`, which strips the TypeScript types on import, so the authored `src/*.ts` is
what executes and there is no compiled copy to fall out of date.

## Versioning & releases

- Version lives in `package.json` and is mirrored by a **git tag** `vMAJOR.MINOR.PATCH`
  (`v0.1.0` first). **Tags are canonical** — that is what consumers pin.
- Pre-1.0: minor bumps may break; document breaks in the release notes.
- Cut a release: bump `package.json`, regenerate `schemas/`, commit, then
  `git tag vX.Y.Z && git push --tags`.
