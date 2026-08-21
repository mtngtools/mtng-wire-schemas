# schemas/ — GENERATED, do not hand-edit

Every `*.schema.json` here is emitted from the Zod source in [`../src/`](../src/) by
`npm run generate`. Hand-edits are overwritten and will fail the drift gate
(`git diff --exit-code`) on the next regeneration.

One file per allow-listed message, named for its export in [`../src/index.ts`](../src/index.ts):
`TimerStateChanged` → `timer-state-changed.schema.json`. Each document is a `$ref` wrapper over
a single named definition, and that definition's name is what the .NET side takes as the C#
class name — so an unwrapped schema would arrive anonymous.

Dropping a message from the allow-list deletes its schema here, and that deletion propagates
through the consumers' drift gates.
