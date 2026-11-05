export type AccountAccess = "patient" | "doctor" | "admin" | "pending";
export function accountAccess(roles: string[], verified: boolean, applied: boolean): AccountAccess {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("doctor") && verified) return "doctor";
  if (applied || roles.includes("doctor")) return "pending";
  return "patient";
}
export function accountDestination(access: AccountAccess) {
  return { patient: "/my-visits", doctor: "/doctor-dashboard", admin: "/admin", pending: "/doctor/register" }[access];
}