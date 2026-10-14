import { z } from "zod";
import {
  switcherComputerName,
  switcherEnvelope,
  switcherLink,
  switcherMixEffect,
  switcherSource,
  switcherSuperSource,
  switcherTallyComputer,
} from "./common.ts";

/**
 * Switcher events — exchange `mtng.events`, routing key `switcher.<name>.<target>`.
 *
 * **Three whole documents, each with its own key, retained queue and request**
 * (mtng-dotnet-mono ADR-0040): the basic state, the advanced state and the tally. A reader
 * joining two documents can briefly see them out of step, such as a program source with no label
 * yet; it shows the bare id.
 */

/**
 * `switcher.state-changed.<target>` — the basic state: every M/E's program and preview,
 * `inTransition` per M/E, and `link`.
 *
 * Published on every program or preview change, at a mix's start and end, and on a link change —
 * once per packet — and as every command's answer. Anything but `link: connected` means the buses
 * are the last the switcher reported, not live; there is no separate flag.
 */
export const SwitcherStateChanged = z
  .strictObject({
    ...switcherEnvelope("state-changed", "event"),
    link: switcherLink,
    mixEffects: z
      .array(switcherMixEffect)
      .min(1)
      .describe("Every M/E, never empty; each numbered from 1."),
  })
  .describe(
    "The switcher's basic state — every M/E's program and preview buses, whether each M/E's " +
      "transition is running, and the link. Anything but link connected means the buses are " +
      "last-known. The whole document, published on every change and as every command's answer.",
  );

export type SwitcherStateChanged = z.infer<typeof SwitcherStateChanged>;

/**
 * `switcher.details-changed.<target>` — the advanced state: `model`, `sources` and
 * `superSources`, and no `link`. Published when any of them changes.
 *
 * No source kind and no M/E availability, for now: either can be added as an optional member
 * without breaking a reader.
 */
export const SwitcherDetailsChanged = z
  .strictObject({
    ...switcherEnvelope("details-changed", "event"),
    model: z.string().describe("The model's name, as the switcher reports it."),
    sources: z
      .array(switcherSource)
      .describe("Every source the switcher reports, each with its id and its two names."),
    superSources: z
      .array(switcherSuperSource)
      .describe("Every SuperSource the switcher has, each with its boxes and its art."),
  })
  .describe(
    "The switcher's advanced state — its model, every source it reports with both names, and " +
      "its SuperSources' boxes and art. No link: the basic state carries it. The whole document, " +
      "published when any of it changes.",
  );

export type SwitcherDetailsChanged = z.infer<typeof SwitcherDetailsChanged>;

/**
 * `switcher.tally-changed.<target>` — every mapped room computer, by virtual name, with its
 * `tally` and, when lit, its `color`; and the basic state's `link`.
 *
 * **Every mapped computer is listed**, so a reader can tell `off` from *not mapped*. With no
 * computers mapped, `computers` is empty — the one document allowed to be (ADR-0040 rule 2). A
 * computer on air when the switcher drops stays `program`, marked by `link`.
 *
 * The `.check()` holds the colour rule — `color` present exactly when `tally` isn't `off` — so
 * this side rejects a malformed light; JSON Schema and C# carry the structure only.
 */
export const SwitcherTallyChanged = z
  .strictObject({
    ...switcherEnvelope("tally-changed", "event"),
    link: switcherLink,
    computers: z
      .record(switcherComputerName, switcherTallyComputer)
      .describe(
        "Virtual name → the computer's light. Every mapped computer is listed; empty when none " +
          "is mapped.",
      ),
  })
  .check((ctx) => {
    for (const [name, computer] of Object.entries(ctx.value.computers)) {
      const lit = computer.tally !== "off";
      if (lit && computer.color === undefined) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["computers", name, "color"],
          message: `'${name}' is lit (${computer.tally}) — a lit computer carries its color`,
        });
      }

      if (!lit && computer.color !== undefined) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["computers", name, "color"],
          message: `'${name}' is off — an unlit computer carries no color`,
        });
      }
    }
  })
  .describe(
    "The switcher's tally — every mapped room computer by virtual name, with its light and, when " +
      "lit, its colour; and the basic state's link. color is present exactly when tally isn't " +
      "off; computers may be empty. Published when it differs in meaning.",
  );

export type SwitcherTallyChanged = z.infer<typeof SwitcherTallyChanged>;
