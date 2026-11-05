import { z } from "zod";
import { formatBookingPhone, type CountryCode } from "./booking-phone";

export const CONSULTATION_PRICE_AED = 249;
export const identitySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("resident"), number: z.string().trim().regex(/^784-\d{4}-\d{7}-\d$/, "Use Emirates ID format 784-XXXX-XXXXXXX-X") }),
  z.object({ type: z.literal("visitor"), number: z.string().trim().regex(/^[A-Za-z0-9 -]{3,32}$/, "Enter a valid passport number (3–32 characters)") }),
]);
export const intakeSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().max(32),
  country: z.custom<CountryCode>(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth").refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10) && Number(value.slice(0, 4)) >= 1900;
  }, "Enter a valid date of birth, not in the future"),
  identity: identitySchema,
}).refine(value => formatBookingPhone(value.phone, value.country) !== null, { path: ["phone"], message: "Enter a valid mobile number" });
export type Intake = z.infer<typeof intakeSchema>;
export const symptomCategories = ["respiratory", "skin", "urgent-gp", "digestive", "mental", "urinary", "pain", "allergies", "sexual", "womens", "children", "general"] as const;
export const reasonSchema = z.object({
  category: z.enum(symptomCategories),
  description: z.string().trim().min(1).max(2000),
  emergency: z.literal(true), telehealth: z.literal(true), privacy: z.literal(true),
});
export type BookingReason = z.infer<typeof reasonSchema>;
export function bookingReturnPath(value: string | null): string | null {
  if (value === "/registration" || value === "/medical-reason" || value === "/payment") return value;
  return value && /^\/waiting-room\?id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}