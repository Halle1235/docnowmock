import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingCountries, formatBookingPhone, getCountryCallingCode, splitBookingPhone } from "./booking-phone";

test("booking offers multiple international country codes", () => {
  for (const country of ["AE", "SE", "GB", "US", "IN"] as const) assert.ok(bookingCountries.includes(country));
  assert.equal(getCountryCallingCode("AE"), "971");
  assert.equal(getCountryCallingCode("SE"), "46");
});
test("UAE local mobile numbers save with the selected international code", () => {
  assert.equal(formatBookingPhone("050 123 4567", "AE"), "+971501234567");
});
test("Swedish local mobile numbers use Sweden's code without duplicating the trunk zero", () => {
  assert.equal(formatBookingPhone("070 123 45 67", "SE"), "+46701234567");
});
test("existing international numbers retain their country and round-trip without duplicate prefixes", () => {
  const phone = splitBookingPhone("+46701234567");
  assert.equal(phone.country, "SE");
  assert.equal(formatBookingPhone(phone.national, phone.country), "+46701234567");
});
test("invalid and embedded numbers are rejected", () => {
  assert.equal(formatBookingPhone("12", "AE"), null);
  assert.equal(formatBookingPhone("call me at +971501234567", "AE"), null);
});