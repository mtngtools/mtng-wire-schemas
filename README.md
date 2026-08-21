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
    messages/                #   one file per message contract, or one folder per domain
      timer/                 #   the Timer manager's set: events, rpc, commands + shared pieces
  schemas/                   # emitted JSON Schema (GENERATED — do not hand-edit)
    <message>.schema.json    #   one file per allow-listed message
  scripts/generate.mjs       # the emitter: src/ (Zod) -> schemas/ (JSON Schema)
  package.json               # Zod SoT + `generate` / `typecheck` / `check` scripts
```

### Authoring rules

- **Every allow-listed export is a Zod schema with a PascalCase name.** The export name becomes
  the schema file name (kebab-cased) *and* the C# class name — renaming an export renames both.
- **Document fields with `.describe()`, not JSDoc.** Only `.describe()` reaches the emitted JSON
  Schema, and from there the generated C# XML doc comments.
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
