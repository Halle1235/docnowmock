// Fictional identities shared by the sample queue, past visits, and journal only.
export const SAMPLE_PATIENTS = [
  { id: "sample-patient", visitId: "sample-1", name: "Amina Hassan", dateOfBirth: "1992-04-18", reason: "Sore throat", allergies: "Penicillin (sample)", notes: "Fictional previous visit: sore throat resolved. No medication recorded." },
  { id: "sample-patient-2", visitId: "sample-2", name: "Omar Khalid", dateOfBirth: "1985-08-12", reason: "Seasonal allergies", allergies: "Not reported (sample)", notes: "Fictional previous visit: sneezing after dust exposure. Symptoms and follow-up discussed." },
  { id: "sample-patient-3", visitId: "sample-3", name: "Layla Mansour", dateOfBirth: "1998-01-26", reason: "Headache", allergies: "None reported (sample)", notes: "Fictional previous visit: intermittent headache. No prescription issued in this sample." },
] as const;