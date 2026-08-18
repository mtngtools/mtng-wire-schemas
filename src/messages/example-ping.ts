import { z } from "zod";

/**
 * Stub sample message so the contract layout is concrete. Replace with real
 * message contracts as the dual-language surface grows.
 *
 * A liveness ping exchanged between a TS app and a .NET app.
 */
export const ExamplePing = z.object({
  /** Monotonic sequence number for this ping stream. */
  sequence: z.number().int().nonnegative(),
  /** ISO-8601 UTC timestamp the ping was emitted. */
  sentAt: z.iso.datetime(),
  /** Opaque sender id (app instance). */
  source: z.string().min(1),
});

export type ExamplePing = z.infer<typeof ExamplePing>;
