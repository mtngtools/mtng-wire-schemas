// The two carrying messages — presentation.state-changed and presentation.enter — and the
// cross-group invariants only a message can enforce (mtngtools/mtng-dotnet-mono#733).
import { test } from "node:test";
import assert from "node:assert/strict";
import { PresentationEnter, PresentationExit } from "../src/messages/presentation/commands.ts";
import { PresentationStateChanged } from "../src/messages/presentation/events.ts";
import {
  assertAccepts,
  assertRejects,
  enterSample,
  fileSample,
  pointerSample,
  presentationSample,
  ts,
} from "./support.mjs";

test("pointer: the core alone validates, and so does the core with every group", () => {
  assertAccepts(PresentationStateChanged, pointerSample());
  assertAccepts(
    PresentationStateChanged,
    pointerSample({
      presentation: presentationSample(),
      session: { ssId: "ss-1", ssTitle: "Morning", ssStart: ts },
      files: [fileSample("lectern-1"), fileSample("lectern-2")],
    }),
  );
});

test("pointer: the presentation group's prId equals the core's", () => {
  assertRejects(
    PresentationStateChanged,
    pointerSample({ presentation: { ...presentationSample(), prId: "pr-other" } }),
    "presentation.prId",
  );
});

test("pointer: phase 'none' carries no group and no body", () => {
  const none = { type: "state-changed", domain: "presentation", kind: "event", ts, phase: "none", enteredAt: ts };
  assertAccepts(PresentationStateChanged, none);
  assertRejects(PresentationStateChanged, { ...none, presentation: presentationSample() }, "presentation");
  assertRejects(PresentationStateChanged, { ...none, session: { ssId: "ss-1" } }, "session");
  assertRejects(PresentationStateChanged, { ...none, files: [fileSample()] }, "files");
  assertRejects(PresentationStateChanged, { ...none, prId: "pr-1" }, "prId");
  assertRejects(PresentationStateChanged, { ...none, actualPrStart: ts }, "actualPrStart");
});

test("pointer: a phase other than 'none' carries prId and actualPrStart", () => {
  assertRejects(PresentationStateChanged, pointerSample({ prId: undefined }), "prId");
  assertRejects(PresentationStateChanged, pointerSample({ actualPrStart: undefined }), "actualPrStart");
});

test("pointer: an empty session group is rejected — omit it instead", () => {
  assertRejects(PresentationStateChanged, pointerSample({ session: {} }), "session");
  assertRejects(PresentationStateChanged, pointerSample({ session: { ssEnd: ts } }), "session.ssStart");
});

test("pointer: instanceId appears once across files, and files is never empty", () => {
  assertRejects(PresentationStateChanged, pointerSample({ files: [fileSample("a"), fileSample("a")] }), "files");
  assertRejects(PresentationStateChanged, pointerSample({ files: [] }), "files");
});

test("pointer: the retired members and the old spellings are typos now", () => {
  assertRejects(PresentationStateChanged, pointerSample({ timer: { minutes: 5 } }), "");
  assertRejects(PresentationStateChanged, pointerSample({ block: { prTitle: "t" } }), "");
  assertRejects(PresentationStateChanged, { ...pointerSample({ prId: undefined }), presentationId: "pr-1" }, "");
});

test("files: the path spells prSubDirectory", () => {
  assertAccepts(PresentationStateChanged, pointerSample({ files: [{ instanceId: "a", path: { prSubDirectory: "d" } }] }));
  assertRejects(
    PresentationStateChanged,
    pointerSample({ files: [{ instanceId: "a", path: { presentationSubDirectory: "d" } }] }),
    "files.0.path",
  );
  assertRejects(PresentationStateChanged, pointerSample({ files: [{ instanceId: "a", path: {} }] }), "files.0.path");
});

test("enter: prId is required and the group's prId equals it", () => {
  assertAccepts(PresentationEnter, enterSample());
  assertAccepts(PresentationEnter, enterSample({ presentation: presentationSample(), session: { ssId: "ss-1" }, file: fileSample() }));
  assertRejects(PresentationEnter, enterSample({ prId: undefined }), "prId");
  assertRejects(PresentationEnter, enterSample({ presentation: { ...presentationSample(), prId: "pr-other" } }), "presentation.prId");
});

test("enter: phase has no 'none' arm, and the retired members are typos", () => {
  assertRejects(PresentationEnter, enterSample({ phase: "none" }), "phase");
  assertRejects(PresentationEnter, enterSample({ timer: {} }), "");
  assertRejects(PresentationEnter, enterSample({ block: {} }), "");
  assertRejects(PresentationEnter, enterSample({ files: [fileSample()] }), "");
  assertRejects(PresentationEnter, { ...enterSample({ prId: undefined }), presentationId: "pr-1" }, "");
});

test("exit: envelope-only", () => {
  assertAccepts(PresentationExit, { type: "exit", domain: "presentation", kind: "command", ts });
  assertRejects(PresentationExit, { type: "exit", domain: "presentation", kind: "command", ts, prId: "pr-1" }, "");
});

test("the group parses to the same object on both carriers", () => {
  const onPointer = assertAccepts(PresentationStateChanged, pointerSample({ presentation: presentationSample() })).presentation;
  const onEnter = assertAccepts(PresentationEnter, enterSample({ presentation: presentationSample() })).presentation;
  assert.deepEqual(onPointer, onEnter);
});
