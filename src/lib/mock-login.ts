// Mock mode never creates an authenticated session or grants live account access.
export const MOCK_LOGIN_ENABLED = true;

export type MockRole = "patient" | "doctor" | "admin";

export function mockLoginDestination(role: MockRole) {
  return `/demo/${role}`;
}

export function isMockRole(value: string | undefined): value is MockRole {
  return value === "patient" || value === "doctor" || value === "admin";
}