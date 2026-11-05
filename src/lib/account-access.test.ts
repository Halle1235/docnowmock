import { test } from "node:test";
import { strict as assert } from "node:assert";
import { accountAccess, accountDestination } from "./account-access";
test("unapproved applicants have no doctor access", () => {
  assert.equal(accountAccess(["patient"], false, true), "pending");
  assert.equal(accountDestination("pending"), "/doctor/register");
});
test("doctor role alone does not establish approval", () => assert.equal(accountAccess(["doctor"], false, true), "pending"));
test("approved doctor requires protected role and verification", () => {
  assert.equal(accountAccess(["doctor"], true, true), "doctor");
  assert.equal(accountAccess(["patient"], true, true), "pending");
});
test("patients and administrators retain separate destinations", () => {
  assert.equal(accountAccess(["patient"], false, false), "patient");
  assert.equal(accountAccess(["admin"], false, false), "admin");
});