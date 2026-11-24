import { test } from "node:test";
import assert from "node:assert/strict";
import { activeVisitPath, canCancelWaitingBooking, orderVisitsByActivity } from "./visit-continuity";

const waiting = {
  id: "11111111-1111-4111-8111-111111111111",
  status: "pending",
  room_ready: false,
  doctor_assigned: false,
  payment_status: "pending",
};

test("only a pending unassigned unpaid booking without a room can be cancelled", () => {
  assert.equal(canCancelWaitingBooking(waiting), true);
  assert.equal(canCancelWaitingBooking({ ...waiting, doctor_assigned: true }), false);
  assert.equal(canCancelWaitingBooking({ ...waiting, room_ready: true }), false);
  assert.equal(canCancelWaitingBooking({ ...waiting, payment_status: "paid" }), false);
  assert.equal(canCancelWaitingBooking({ ...waiting, status: "claimed" }), false);
});

test("active visits stay before completed and cancelled history without reordering each group", () => {
  const completed = { ...waiting, id: "completed", status: "completed" };
  const active = { ...waiting, id: "active" };
  const cancelled = { ...waiting, id: "cancelled", status: "cancelled" };
  assert.deepEqual(orderVisitsByActivity([completed, active, cancelled]).map((visit) => visit.id), [
    "active",
    "completed",
    "cancelled",
  ]);
});

test("ready active visits open the call while other active visits resume the waiting room", () => {
  assert.equal(activeVisitPath({ ...waiting, status: "claimed", doctor_assigned: true, room_ready: true }), `/call/${waiting.id}`);
  assert.equal(activeVisitPath(waiting), `/waiting-room?id=${waiting.id}`);
  assert.equal(activeVisitPath({ ...waiting, status: "claimed", doctor_assigned: true }), `/waiting-room?id=${waiting.id}`);
});
