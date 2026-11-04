/// <reference types="node" />
import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyPresentation } from "./daily-presentation";
test("consultations begin with audio muted", () => {
  assert.equal(dailyPresentation(() => "#0FA0A5").startAudioOff, true);
});