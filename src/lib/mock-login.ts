// Mock mode never creates an authenticated session or grants live account access.
export const MOCK_LOGIN_ENABLED = true;
export const MOCK_PAYMENT_ENABLED = true;

export const mockConsultation = {
  id: "mock-consultation",
  patient_id: "mock-patient",
  status: "pending",
  payment_status: "paid",
  payment_amount: 249,
  created_at: "2026-11-04T00:00:00Z",
  reason_category: "general",
  reason_description: "Sample consultation",
  profiles: { full_name: "Demo patient", phone: "" },
  visit_summary: null,
  visit_summary_approved_at: null,
};

export type MockRole = "patient" | "doctor" | "admin";

export function mockLoginDestination(role: MockRole) {
  if (role === "patient") return "/my-visits";
  if (role === "doctor") return "/doctor-dashboard";
  return "/demo/admin";
}

export function isMockRole(value: string | undefined): value is MockRole {
  return value === "patient" || value === "doctor" || value === "admin";
}