# schemas/ — GENERATED, do not hand-edit

Every `*.schema.json` here is emitted from the Zod source in [`../src/`](../src/) by
`npm run generate`. Hand-edits are overwritten and will fail the drift gate
(`git diff --exit-code`) on the next regeneration.

One file per authored message or document — every PascalCase Zod export under
[`../src/messages/`](../src/messages/), whether or not the barrel exports it (mtng-dotnet-mono
ADR-0026) — named for that export: `TimerStateChanged` → `timer-state-changed.schema.json`,
`TimerPresets` → `timer-presets.schema.json`. Each file is a `$ref` wrapper over a single named
definition, and that definition's name is what the .NET side takes as the C# class name — so an
unwrapped schema would arrive anonymous.

Removing or renaming an export deletes its schema here, and that deletion propagates through
the consumers' drift gates.
