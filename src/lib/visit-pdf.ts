import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { type PatientVisit } from "./patient-workspace";

export async function buildVisitPdf(visit: PatientVisit, kind: "prescription" | "receipt", origin: string) {
  const pdf = new jsPDF();
  let y = 22;
  const line = (text: string, size = 11) => {
    pdf.setFontSize(size);
    const lines: string[] = pdf.splitTextToSize(text, 170);
    for (const part of lines) { if (y > 268) { pdf.addPage(); y = 22; } pdf.text(part, 20, y); y += size > 14 ? 10 : 6; }
    y += 3;
  };
  line("DocNow", 22);
  line(kind === "prescription" ? "Sample prescription draft" : "Sample payment receipt", 16);
  line("SAMPLE ONLY - NOT VALID FOR PHARMACY, INSURANCE OR PAYMENT", 10);
  line(`Reference: ${visit.id}`);
  line(`Patient: Sample patient | Doctor: ${visit.doctor}`);
  line(`Visit date: ${new Date(visit.createdAt).toLocaleDateString("en-GB")}`);
  line(`Consultation: ${visit.reason}`);
  if (kind === "receipt") {
    line(`Amount: AED ${visit.amount.toFixed(2)}`, 15);
    line("Payment: Simulated payment - no money was charged.");
    line("This sample is not an insurance claim document or tax invoice.");
  } else {
    if (visit.prescriptions.length) for (const medicine of visit.prescriptions) { line(medicine.medicine, 13); line(`${medicine.dose} | ${medicine.frequency} | ${medicine.duration}`); }
    else line("No medicine prescribed in this sample visit.");
    line("No clinician signature. Not issued or validated as a real prescription.");
    const qr = await QRCode.toDataURL(`${origin}/my-visits?verify=sample-prescription`, { width: 180, margin: 1 });
    if (y > 210) { pdf.addPage(); y = 22; }
    pdf.addImage(qr, "PNG", 20, y, 35, 35); y += 42;
    line("QR opens a sample-only verification notice. No medical data is encoded.", 10);
  }
  return pdf.output("blob");
}