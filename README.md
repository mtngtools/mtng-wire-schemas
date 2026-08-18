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
    messages/                #   one file per message contract
      example-ping.ts        #   stub sample — replace/extend with real contracts
  schemas/                   # emitted JSON Schema (GENERATED — do not hand-edit)
    <message>.schema.json    #   one file per allow-listed message
  package.json               # Zod SoT + generator toolchain + `generate` script
```

## Generate the JSON Schema

```sh
npm install
npm run generate        # src/ (Zod) -> schemas/ (JSON Schema)  [not wired yet — see Status]
```

Generated output in `schemas/` is **committed**, and each consumer guards it with
`git diff --exit-code` so a schema change that wasn't regenerated fails CI on the stale side.

> **Status:** scaffold. The exact command chain (Zod → JSON Schema via `ts-json-schema-generator`,
> then JSON Schema → C# via NJsonSchema) is proven end-to-end by the acceptance spike tracked in
> `mtng-dotnet-mono` (foundation map). Until then, `schemas/` holds a stub so the layout is fixed.

## Versioning & releases

- Version lives in `package.json` and is mirrored by a **git tag** `vMAJOR.MINOR.PATCH`
  (`v0.1.0` first). **Tags are canonical** — that is what consumers pin.
- Pre-1.0: minor bumps may break; document breaks in the release notes.
- Cut a release: bump `package.json`, regenerate `schemas/`, commit, then
  `git tag vX.Y.Z && git push --tags`.
