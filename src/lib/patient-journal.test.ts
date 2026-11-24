import { test } from "node:test";
import { strict as assert } from "node:assert";
import { validJournalEntry } from "./patient-journal";

test("journal rejects empty or oversized clinical input", () => {
  assert.equal(validJournalEntry("", "", " "), false);
  assert.equal(validJournalEntry("x".repeat(1001), "", "Notes"), false);
  assert.equal(validJournalEntry("", "x".repeat(4001), "Notes"), false);
  assert.equal(validJournalEntry("", "", "x".repeat(10001)), false);
  assert.equal(validJournalEntry("x".repeat(1000), "x".repeat(4000), "x".repeat(10000)), true);
});
