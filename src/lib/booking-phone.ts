import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export const bookingCountries = getCountries();
export const defaultBookingCountry: CountryCode = "AE";
export { getCountryCallingCode };
export type { CountryCode };

export function splitBookingPhone(value: string): { country: CountryCode; national: string } {
  const parsed = parsePhoneNumberFromString(value, defaultBookingCountry);
  if (!parsed) return { country: defaultBookingCountry, national: value };
  return { country: parsed.country ?? defaultBookingCountry, national: parsed.formatNational() };
}

export function formatBookingPhone(value: string, country: CountryCode): string | null {
  const parsed = parsePhoneNumberFromString(value, { defaultCountry: country, extract: false });
  if (!parsed?.isValid()) return null;
  return parsed.number;
}