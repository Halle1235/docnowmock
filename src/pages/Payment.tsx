import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
export default function Payment() {
 const navigate = useNavigate();
 return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-lg space-y-6"><h1 className="text-2xl font-bold text-primary">DocNow · Payment</h1><p role="status">Appointment payments are not available yet. No appointment has been booked and no payment has been taken.</p><p className="text-muted-foreground">A secure payment service must be connected before paid consultations can be booked.</p><Button onClick={() => navigate("/my-visits")}>My visits</Button></div></main>;
}
