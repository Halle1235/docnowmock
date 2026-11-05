import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccount } from "@/components/AccountProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function DoctorRegistration() {
  const { user, access, loading, refresh } = useAccount();
  const navigate = useNavigate();
  const [license, setLicense] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    const { error } = await supabase.rpc("apply_for_doctor", { _license_number: license, _specialization: specialization });
    if (error) toast.error(error.message); else { toast.success("Application submitted for administrator approval."); await refresh(); }
    setBusy(false);
  };
  return <main className="min-h-screen bg-background px-4 py-12"><div className="mx-auto max-w-md space-y-6"><h1 className="text-2xl font-bold text-primary">DocNow · Doctor application</h1>{loading ? <p>Checking account…</p> : !user ? <><p>Create an account or sign in before submitting your licence for approval.</p><Button onClick={() => navigate("/auth?as=doctor&mode=signup")}>Create account</Button><Button variant="outline" onClick={() => navigate("/auth?as=doctor")}>Sign in</Button></> : access === "pending" ? <><h2 className="text-xl font-semibold">Awaiting administrator approval</h2><p className="text-muted-foreground">Your application is pending. You cannot access patients until your licence has been reviewed and approved.</p><Button onClick={() => void refresh()}>Check approval status</Button><Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate("/auth?as=doctor"); }}>Sign out</Button></> : access === "doctor" || access === "admin" ? <Button onClick={() => navigate(access === "admin" ? "/admin" : "/doctor-dashboard")}>Open dashboard</Button> : <form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="license">DHA licence number</Label><Input id="license" required minLength={2} maxLength={64} value={license} onChange={e => setLicense(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="specialization">Specialisation</Label><Input id="specialization" required minLength={2} maxLength={120} value={specialization} onChange={e => setSpecialization(e.target.value)} /></div><Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for approval"}</Button></form>}</div></main>;
}