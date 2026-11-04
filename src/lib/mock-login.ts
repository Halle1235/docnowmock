// Mock mode never creates an authenticated session or grants live account access.
// The original screens show sample data only while this is on.
export const MOCK_LOGIN_ENABLED = true;

export type MockRole = "patient" | "doctor" | "admin";

const destinations: Record<MockRole, string> = {
  patient: "/my-visits",
  doctor: "/doctor-dashboard",
  admin: "/admin",
};

export function mockLoginDestination(role: MockRole) {
  return destinations[role];
}

export function isMockRole(value: string | undefined): value is MockRole {
  return value === "patient" || value === "doctor" || value === "admin";
}

/** Consultation id used for the shared demo video room. */
export const DEMO_CALL_ID = "demo";

export function demoCallPath(role: "doctor" | "patient") {
  return `/call/${DEMO_CALL_ID}?as=${role}`;
}

export const SAMPLE_CONSULTATION = {
  id: "sample-1",
  patient_id: "sample-patient",
  status: "pending",
  payment_status: "paid",
  payment_amount: 249,
  created_at: new Date().toISOString(),
  reason_category: "respiratory" as string | undefined,
  reason_description: "Sore throat and mild fever for two days",
  profiles: { full_name: "Sample patient", phone: "+971 50 000 0000", age: 34, allergies: "Penicillin" },
};
