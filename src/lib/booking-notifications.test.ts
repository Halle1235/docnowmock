import { test } from "node:test";
import { strict as assert } from "node:assert";
import { bookingChanges, bookingNotifications, notifyBooking } from "./booking-notifications";

test("doctor notifications identify new pending bookings but not repeats or assigned visits", () => {
  const before = [{ id: "existing", status: "pending" }];
  assert.deepEqual(bookingChanges("doctor", before, [...before, { id: "new", status: "pending" }, { id: "assigned", status: "claimed" }]).map(v => v.id), ["new"]);
  assert.deepEqual(bookingChanges("doctor", before, before), []);
});
test("patient acceptance alerts occur on acceptance, not on call progress or completion", () => {
  assert.equal(bookingChanges("patient", [{ id: "a", status: "pending" }], [{ id: "a", status: "claimed" }]).length, 1);
  assert.equal(bookingChanges("patient", [{ id: "a", status: "claimed" }], [{ id: "a", status: "in_progress" }]).length, 0);
  assert.equal(bookingChanges("patient", [{ id: "a", status: "pending" }], [{ id: "a", status: "completed" }]).length, 0);
});
test("notifications deduplicate and can be marked read", () => {
  notifyBooking("doctor", "arrival:a", "Waiting");
  notifyBooking("doctor", "arrival:a", "Waiting");
  assert.equal(bookingNotifications.getSnapshot("doctor").length, 1);
  bookingNotifications.markRead("doctor");
  assert.equal(bookingNotifications.getSnapshot("doctor")[0].read, true);
});
