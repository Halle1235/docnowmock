/// <reference types="node" />
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { isMockRole, MOCK_LOGIN_ENABLED, mockLoginDestination } from "./mock-login";

describe("temporary mock logins", () => {
  test("logins use mock mode for now", () => {
    assert.equal(MOCK_LOGIN_ENABLED, true);
  });
  for (const role of ["patient", "doctor", "admin"] as const) {
    test(`${role} login leads only to its demo screen`, () => {
      assert.equal(mockLoginDestination(role), `/demo/${role}`);
    });
  }
  test("unknown roles are not accepted", () => {
    assert.equal(isMockRole("owner"), false);
    assert.equal(isMockRole(undefined), false);
  });
});