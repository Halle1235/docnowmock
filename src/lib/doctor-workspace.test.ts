/// <reference types="node" />
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { dailyStats, doctorWorkspace, isLongWait, patientAge, searchHistory, validPrescription } from "./doctor-workspace";

describe("doctor sample workspace", () => {
  test("offline doctors cannot accept new consultations", () => {
    doctorWorkspace.setAvailable(false);
    doctorWorkspace.claim("sample-1");
    assert.equal(doctorWorkspace.getSnapshot().visits[0].status, "pending");
  });
  test("offline doctors cannot add queue patients", () => {
    const count = doctorWorkspace.getSnapshot().visits.length;
    doctorWorkspace.addSamplePatient();
    assert.equal(doctorWorkspace.getSnapshot().visits.length, count);
  });
  test("age accounts for the birthday and unknown values", () => {
    assert.equal(patientAge("1992-04-18", new Date("2026-04-17T12:00:00")), 33);
    assert.equal(patientAge("1992-04-18", new Date("2026-04-18T12:00:00")), 34);
    assert.equal(patientAge(""), null);
    assert.equal(patientAge("2025-02-30"), null);
  });
  test("wait alerts begin at five minutes", () => {
    assert.equal(isLongWait({ createdAt: 0 }, 299999), false);
    assert.equal(isLongWait({ createdAt: 0 }, 300000), true);
  });
  test("all dose fields must be explicitly entered", () => {
    assert.equal(validPrescription({ medicine: "Paracetamol", dose: "", frequency: "", duration: "" }), false);
    assert.equal(validPrescription({ medicine: "Test medicine", dose: "Clinician dose", frequency: "Clinician frequency", duration: "Clinician duration" }), true);
  });
  test("unassigned consultations cannot receive notes", () => {
    assert.equal(doctorWorkspace.saveDraft("sample-1", "test", []), false);
  });
  test("daily stats use joined call time and history includes notes and prescriptions", () => {
    const now = new Date("2026-11-04T12:00:00");
    doctorWorkspace.setAvailable(true);
    doctorWorkspace.claim("sample-1");
    assert.equal(doctorWorkspace.saveDraft("sample-1", "Follow up", [{ medicine: "Test medicine", dose: "Test dose", frequency: "Test frequency", duration: "Test duration" }]), true);
    assert.equal(doctorWorkspace.saveDraft("sample-1", "x".repeat(10001), []), false);
    doctorWorkspace.startCall("sample-1", now.getTime() - 120000);
    doctorWorkspace.finishCall("sample-1", now.getTime());
    const visits = doctorWorkspace.getSnapshot().visits;
    assert.deepEqual(dailyStats(visits, now), { completed: 1, averageSeconds: 120 });
    assert.equal(dailyStats(visits, new Date("2026-11-05T12:00:00")).completed, 0);
    assert.equal(searchHistory(visits, "follow up").length, 1);
    assert.equal(searchHistory(visits, "test medicine").length, 1);
    assert.equal(searchHistory(visits, "unmatched").length, 0);
    assert.equal(doctorWorkspace.saveDraft("sample-1", "Cannot edit completed", []), false);
  });
});