/// <reference types="node" />
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { dailyStats, isLongWait, matchesSearch } from "./doctor-tools";

const now = new Date("2026-11-04T12:00:00");

describe("doctor tools", () => {
  test("patients waiting 5 minutes or more are highlighted", () => {
    assert.equal(isLongWait("2026-11-04T11:55:00", now.getTime()), true);
    assert.equal(isLongWait("2026-11-04T11:56:00", now.getTime()), false);
  });
  test("daily stats count only consultations completed today", () => {
    const s = dailyStats([
      { status: "completed", claimed_at: "2026-11-04T09:00:00", completed_at: "2026-11-04T09:10:00" },
      { status: "completed", claimed_at: "2026-11-04T10:00:00", completed_at: "2026-11-04T10:20:00" },
      { status: "completed", claimed_at: "2026-11-03T10:00:00", completed_at: "2026-11-03T10:30:00" },
      { status: "claimed", claimed_at: "2026-11-04T11:00:00", completed_at: null },
    ], now);
    assert.equal(s.completedToday, 2);
    assert.equal(s.averageMinutes, 15);
  });
  test("history search looks in notes and prescriptions", () => {
    assert.equal(matchesSearch({ notes: "Sore throat", prescription: "Amoxicillin" }, "amoxi"), true);
    assert.equal(matchesSearch({ notes: "Sore throat" }, "rash"), false);
  });
});
