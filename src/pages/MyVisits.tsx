import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { SummaryView, VisitSummary } from "@/components/VisitSummaryDialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import { FileText, LogOut, Video } from "lucide-react";
import { MOCK_LOGIN_ENABLED, demoCallPath } from "@/lib/mock-login";
import PatientWorkspace from "@/components/PatientWorkspace";

interface Visit {
  id: string;
  created_at: string | null;
  reason_category: string | null;
  status: string;
  visit_summary: VisitSummary | null;
  visit_summary_approved_at: string | null;
}

const LiveMyVisits = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);

  const [doctorInCall, setDoctorInCall] = useState(false);

  useEffect(() => {
    if (!MOCK_LOGIN_ENABLED) return;
    let active = true;
    const check = async () => {
      const { data } = await supabase.functions.invoke("demo-call-room", { body: { action: "status" } });
      if (active) setDoctorInCall(!!data?.doctorInCall);
    };
    check();
    const id = setInterval(check, 4000);
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (MOCK_LOGIN_ENABLED) {
      // Demo: one sample visit, no real records.
      setVisits([{ id: "sample-1", created_at: new Date().toISOString(), reason_category: null, status: "claimed", visit_summary: null, visit_summary_approved_at: null }]);
      setLoading(false);
      return;
    }
    let userId = "";
    const load = async () => {
      const { data } = await supabase
        .from("consultations")
        .select("id, created_at, reason_category, status, visit_summary, visit_summary_approved_at")
        .eq("patient_id", userId)
        .order("created_at", { ascending: false });
      setVisits((data as unknown as Visit[]) || []);
      setLoading(false);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/auth"); return; }
      userId = session.user.id;
      load();
      channel = supabase
        .channel("my-visits")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "consultations", filter: `patient_id=eq.${userId}` }, load)
        .subscribe();
    });
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-primary cursor-pointer" onClick={() => navigate("/")}>{t("header.brand")}</h1>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" onClick={async () => { if (!MOCK_LOGIN_ENABLED) await supabase.auth.signOut(); navigate("/"); }}>
              <LogOut className="h-4 w-4 me-2" />{t("header.logout")}
            </Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div>
          <h2 className="text-3xl font-bold mb-1">My visits</h2>
          <p className="text-muted-foreground">Summaries appear here once your doctor has reviewed and approved them.</p>
        </div>
        {loading ? (
          <p className="text-muted-foreground">{t("dashboard.loading")}</p>
        ) : visits.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">You have no visits yet.</Card>
        ) : (
          visits.map((v) => (
            <Card key={v.id} className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="font-semibold">
                    {v.reason_category ? t(`medicalReason.categories.${v.reason_category}`) : "Consultation"}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {v.created_at ? new Date(v.created_at).toLocaleDateString() : ""}
                </span>
              </div>
              {MOCK_LOGIN_ENABLED && (
                <div className="flex items-center gap-3">
                  <Button disabled={!doctorInCall} onClick={() => navigate(demoCallPath("patient"))}>
                    <Video className="h-4 w-4 me-2" />Join call
                  </Button>
                  {!doctorInCall && <span className="text-sm text-muted-foreground">Waiting for the doctor to start…</span>}
                </div>
              )}
              {v.visit_summary && v.visit_summary_approved_at ? (
                <SummaryView s={v.visit_summary} />
              ) : (
                <p className="text-sm text-muted-foreground">Your doctor hasn't shared a summary for this visit yet.</p>
              )}
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default function MyVisits() { return MOCK_LOGIN_ENABLED ? <PatientWorkspace /> : <LiveMyVisits />; }
