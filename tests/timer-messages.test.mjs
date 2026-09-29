// The timer's two events: the key they gained, the groups they kept, and the members they lost
// (mtngtools/mtng-dotnet-mono#733).
import { test } from "node:test";
import { TimerCueFired, TimerStateChanged } from "../src/messages/timer/events.ts";
import { assertAccepts, assertRejects, cueFiredSample, fileSample, timerStateSample, ts } from "./support.mjs";

for (const [name, schema, sample] of [
  ["state-changed", TimerStateChanged, timerStateSample],
  ["cue-fired", TimerCueFired, cueFiredSample],
]) {
  test(`${name}: carries prId and phase together, or neither`, () => {
    assertAccepts(schema, sample());
    assertAccepts(schema, sample({ prId: "pr-1", phase: "talk" }));
    assertRejects(schema, sample({ prId: "pr-1" }), "phase");
    assertRejects(schema, sample({ phase: "talk" }), "prId");
    assertRejects(schema, sample({ prId: "pr-1", phase: "none" }), "phase");
    assertRejects(schema, sample({ prId: "", phase: "talk" }), "prId");
  });

  test(`${name}: carries session and files, in either dialect`, () => {
    assertAccepts(schema, sample({ prId: "pr-1", phase: "qa", session: { ssId: "ss-1" }, files: [fileSample()] }));
    assertAccepts(schema, sample({ session: { ssTitle: "Morning", ssStart: ts } }));
    assertRejects(schema, sample({ session: {} }), "session");
    assertRejects(schema, sample({ files: [fileSample("a"), fileSample("a")] }), "files");
  });

  test(`${name}: never the presentation group, and never the retired timer or block members`, () => {
    assertRejects(schema, sample({ presentation: { prId: "pr-1", prTitle: "t" } }), "");
    assertRejects(schema, sample({ timer: { minutes: 5 } }), "");
    assertRejects(schema, sample({ block: { prTitle: "t" } }), "");
    assertRejects(schema, sample({ presentationId: "pr-1" }), "");
  });
}
