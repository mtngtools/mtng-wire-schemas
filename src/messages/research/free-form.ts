import { z } from "zod";

/**
 * THROWAWAY RESEARCH MESSAGES — mtng-dotnet-mono#716.
 *
 * Not a real domain and never exported from `src/index.ts`. Each message below tries one
 * candidate shape for an open, host-defined "properties bag" through the real pipeline
 * (`npm run generate` -> NJsonSchema -> C#), so #717 can design against observed generator
 * output instead of assumptions. Lives only on the `research/free-form-properties-mirror`
 * branch — delete before merging anything back to main.
 */

const researchEnvelope = <TType extends string>(type: TType) => ({
  type: z.enum([type]).describe("The message name — <name> in the routing key."),
  domain: z.enum(["research"]).describe("Throwaway domain, this branch only."),
  kind: z.enum(["event"]).describe("Which exchange carries this message."),
  ts: z.iso.datetime().describe("The PUBLISH instant, ISO-8601 UTC."),
});

/**
 * Candidate A — `z.record(z.string(), z.unknown())` as a NESTED object member, alongside fixed
 * fields on the same message. This is the shape #717 would reach for first: a `properties` bag
 * beside `name`.
 */
export const ResearchFreeFormRecordMember = z
  .strictObject({
    ...researchEnvelope("research-free-form-record-member"),
    name: z.string().min(1).describe("A fixed field beside the bag."),
    properties: z
      .record(z.string(), z.unknown())
      .describe("Open bag: host-defined keys, unknown value shape."),
  })
  .describe("Candidate A: record<string, unknown> nested beside fixed fields.");

/**
 * Candidate A2 — same as A, but the bag is `.optional()`, which is how #717 would actually
 * author it (absent means "no bag", not "empty object"). Checked because `GenerateOptionalPropertiesAsNullable`
 * is a non-default generator setting this repo relies on for exactly this distinction.
 */
export const ResearchFreeFormRecordMemberOptional = z
  .strictObject({
    ...researchEnvelope("research-free-form-record-member-optional"),
    name: z.string().min(1).describe("A fixed field beside the bag."),
    properties: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Open bag: host-defined keys, unknown value shape. Absent means none attached."),
  })
  .describe("Candidate A2: record<string, unknown>, optional, nested beside fixed fields.");

/**
 * Candidate B — `z.looseObject({...})` at the message's TOP level: the whole message allows
 * extra, unnamed properties beside its own fixed fields (no separate bag field at all).
 */
export const ResearchFreeFormLooseTopLevel = z
  .looseObject({
    ...researchEnvelope("research-free-form-loose-top-level"),
    name: z.string().min(1).describe("A fixed field on an otherwise-open message."),
  })
  .describe("Candidate B: looseObject — additionalProperties allowed at the message's own top level.");

/**
 * Candidate C — `.catchall(z.unknown())` on a NESTED group, so the fixed envelope stays a
 * strictObject and only one embedded group is open. Tests whether "additionalProperties: true"
 * (unconstrained) behaves differently nested than at a message's top level (compare to B).
 */
const freeFormGroup = z
  .object({
    label: z.string().min(1).describe("A fixed field inside the otherwise-open group."),
  })
  .catchall(z.unknown())
  .meta({ title: "FreeFormGroup" })
  .describe("A nested group: one fixed field, plus whatever else the host attaches.");

export const ResearchFreeFormCatchallNested = z
  .strictObject({
    ...researchEnvelope("research-free-form-catchall-nested"),
    group: freeFormGroup,
  })
  .describe("Candidate C: catchall(unknown) on a nested group, envelope itself stays strict.");

/**
 * Candidate D — the ENTIRE message body is `z.record(z.string(), z.unknown())`, no envelope at
 * all. Tests the purest "additionalProperties" case at a schema's own root, with nothing else
 * for NJsonSchema to hang a class name off of.
 */
export const ResearchFreeFormRecordWholeMessage = z
  .record(z.string(), z.unknown())
  .describe("Candidate D: the whole message is an open bag, no fixed fields anywhere.");
