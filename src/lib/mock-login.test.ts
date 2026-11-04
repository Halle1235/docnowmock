/// <reference types="node" />
import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { isMockRole, MOCK_LOGIN_ENABLED, MOCK_PAYMENT_ENABLED, mockLoginDestination } from "./mock-login";

describe("temporary mock logins", () => {
  test("logins use mock mode for now", () => {
    assert.equal(MOCK_LOGIN_ENABLED, true);
  });
  test("patient mock login retains the original visits page", () => {
    assert.equal(mockLoginDestination("patient"), "/my-visits");
  });
  test("doctor mock login retains the original dashboard", () => {
    assert.equal(mockLoginDestination("doctor"), "/doctor-dashboard");
  });
  test("admin preview remains separate from live administration", () => {
    assert.equal(mockLoginDestination("admin"), "/demo/admin");
  });
  test("payment remains simulated", () => {
    assert.equal(MOCK_PAYMENT_ENABLED, true);
  });
  test("unknown roles are not accepted", () => {
    assert.equal(isMockRole("owner"), false);
    assert.equal(isMockRole(undefined), false);
  });
});