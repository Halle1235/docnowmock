import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingReturnPath, CONSULTATION_PRICE_AED, identitySchema, intakeSchema, reasonSchema } from "./booking-intake";
const intake = { fullName: "Test Patient", email: "test@example.com", phone: "0501234567", country: "AE", dateOfBirth: "1990-01-01", identity: { type: "resident", number: "784-1990-1234567-1" } };
test("consultation costs AED 249", () => assert.equal(CONSULTATION_PRICE_AED, 249));
test("resident ID uses required Emirates ID format", () => {
  assert.ok(identitySchema.safeParse(intake.identity).success);
  assert.equal(identitySchema.safeParse({ type: "resident", number: "785-1990-1234567-1" }).success, false);
});
test("tourists use a passport instead of an Emirates ID", () => assert.ok(identitySchema.safeParse({ type: "visitor", number: "AB123456" }).success));
test("intake requires a real date and valid contact details", () => {
  assert.ok(intakeSchema.safeParse(intake).success);
  for (const change of [{ dateOfBirth: "1990-02-30" }, { dateOfBirth: "2999-01-01" }, { email: "invalid" }, { phone: "12" }]) assert.equal(intakeSchema.safeParse({ ...intake, ...change }).success, false);
});
test("every telehealth, emergency and privacy acknowledgement is required", () => {
  const reason = { category: "urgent-gp", description: "Non-emergency concern", emergency: true, telehealth: true, privacy: true };
  assert.ok(reasonSchema.safeParse(reason).success);
  for (const key of ["emergency", "telehealth", "privacy"]) assert.equal(reasonSchema.safeParse({ ...reason, [key]: false }).success, false);
});
test("auth returns only to approved booking paths and visit UUID links", () => {
  assert.equal(bookingReturnPath("/medical-reason"), "/medical-reason");
  const visit = "/waiting-room?id=12345678-1234-1234-1234-123456789abc";
  assert.equal(bookingReturnPath(visit), visit);
  for (const value of ["https://evil.example", "//evil.example", "/admin", "/waiting-room?id=bad"]) assert.equal(bookingReturnPath(value), null);
});