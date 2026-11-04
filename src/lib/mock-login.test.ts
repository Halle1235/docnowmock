import { describe, expect, test } from "bun:test";
import { isMockRole, MOCK_LOGIN_ENABLED, mockLoginDestination } from "./mock-login";

describe("temporary mock logins", () => {
  test("logins use mock mode for now", () => {
    expect(MOCK_LOGIN_ENABLED).toBe(true);
  });
  for (const role of ["patient", "doctor", "admin"] as const) {
    test(`${role} login leads only to its demo screen`, () => {
      expect(mockLoginDestination(role)).toBe(`/demo/${role}`);
    });
  }
  test("unknown roles are not accepted", () => {
    expect(isMockRole("owner")).toBe(false);
    expect(isMockRole(undefined)).toBe(false);
  });
});