/// <reference types="node" />
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { demoCallPath, isMockRole, MOCK_LOGIN_ENABLED, mockLoginDestination } from "./mock-login";

describe("temporary mock logins", () => {
  test("logins use mock mode for now", () => {
    assert.equal(MOCK_LOGIN_ENABLED, true);
  });
  test("logins lead to the original screens", () => {
    assert.equal(mockLoginDestination("patient"), "/my-visits");
    assert.equal(mockLoginDestination("doctor"), "/doctor-dashboard");
    assert.equal(mockLoginDestination("admin"), "/admin");
  });
  test("demo calls use the original call screen", () => {
    assert.equal(demoCallPath("doctor"), "/call/demo?as=doctor");
  });
  test("unknown roles are not accepted", () => {
    assert.equal(isMockRole("owner"), false);
    assert.equal(isMockRole(undefined), false);
  });
});
