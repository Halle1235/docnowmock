import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { SummaryView, VisitSummary } from "@/components/VisitSummaryDialog";
import PatientJournal from "@/components/PatientJournal";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  HeartPulse,
  LogOut,
  Plus,
  Stethoscope,
  Video,
} from "lucide-react";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAccount } from "@/components/AccountProvider";
import { useBookingDraft } from "@/components/BookingDraftProvider";
import { onForeground } from "@/lib/foreground";
import { cancelMyWaitingBooking } from "@/lib/booking-continuity";
import { activeVisitPath, canCancelWaitingBooking, isActiveVisit, orderVisitsByActivity } from "@/lib/visit-continuity";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Visit {
  id: string;
  created_at: string | null;
  reason_category: string | null;
  status: string;
  room_url: string | null;
  doctor_id: string | null;
  payment_status: string;
  visit_summary: VisitSummary | null;
  visit_summary_approved_at: string | null;
}

const LiveMyVisits = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAccount();
  const { clearDraft } = useBookingDraft();
  const userId = user?.id;
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"visits" | "journal">("visits");
  const [journalFilter, setJournalFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useBookingNotifications("patient", visits, !loading && !failed);

  const cancel = useMutation({
    mutationFn: cancelMyWaitingBooking,
    onSuccess: (cancelled, id) => {
      if (cancelled) {
        setVisits((current) => current.map((visit) => visit.id === id ? { ...visit, status: "cancelled" } : visit));
        toast.success(t("history.cancelled"));
      } else {
        toast.error(t("history.cancelConflict"));
      }
      setAttempt((value) => value + 1);
    },
    onError: () => toast.error(t("history.cancelError")),
  });
  const orderedVisits = orderVisitsByActivity(visits);
  const bookFollowUp = () => {
    clearDraft();
    navigate("/registration");
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    let request = 0;
    setPatientEmail(user?.email || "");
    const load = async () => {
      const current = ++request;
      const [consultRes, profileRes] = await Promise.all([
        supabase
          .from("consultations")
          .select("id, created_at, reason_category, status, room_url, doctor_id, payment_status, visit_summary, visit_summary_approved_at")
          .eq("patient_id", userId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      if (!active || current !== request) return;
      setFailed(!!consultRes.error);
      if (!consultRes.error) setVisits((consultRes.data as unknown as Visit[]) || []);
      if (profileRes.data?.full_name) setPatientName(profileRes.data.full_name);
      setLoading(false);
    };

    void load();
    const channel = supabase
      .channel(`my-visits-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations", filter: `patient_id=eq.${userId}` }, load)
      .subscribe((state) => { if (state === "SUBSCRIBED") void load(); });
    const unsubscribe = onForeground(() => { void load(); });
    return () => {
      active = false;
      unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [userId, attempt, user?.email]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_progress":
        return (
          <Badge className="bg-primary/15 text-primary border-primary/30 flex items-center gap-1.5 font-medium text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            In progress
          </Badge>
        );
      case "claimed":
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1.5 font-medium text-xs"
          >
            <Clock className="h-3 w-3" />
            Doctor assigned
          </Badge>
        );
      case "pending":
        return (
          <Badge
            variant="outline"
            className="border-amber-500/30 text-amber-600 bg-amber-500/10 flex items-center gap-1.5 font-medium text-xs"
          >
            <Clock className="h-3 w-3" />
            Waiting in queue
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 font-medium text-xs">
            <CheckCircle2 className="h-3 w-3" />
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="font-medium text-xs">
            {t(`status.${status}`, status)}
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="container mx-auto px-4 py-3 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
            <HeartPulse className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight text-primary">DocNow</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <BookingNotifications role="patient" />
            <LanguageSwitcher />

            {patientEmail && (
              <span className="hidden sm:inline text-xs text-muted-foreground border-s ps-3">
                {patientName || patientEmail}
              </span>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/");
              }}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              <LogOut className="h-3.5 w-3.5 me-1.5" />
              {t("header.logout")}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border border-primary/20 shadow-sm">
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                  {(patientName || "P").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {patientName ? `Welcome back, ${patientName}` : "My visits & medical records"}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  View your consultation history, attending physician instructions, and medical journal entries.
                </p>
              </div>
            </div>

            <Button onClick={() => navigate("/registration")} className="gap-2 shadow-sm font-semibold shrink-0">
              <Plus className="h-4 w-4" />
              Book consultation
            </Button>
          </div>
        </div>

        {/* Tab Switcher: Consultations vs Medical Journal */}
        <div className="flex rounded-xl border bg-card p-1 text-xs sm:text-sm shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("visits")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-medium transition-colors",
              activeTab === "visits"
                ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Calendar className="h-4 w-4" />
            {t("visits.tabVisits", "Consultations & Visits")} ({visits.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("journal")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 font-medium transition-colors",
              activeTab === "journal"
                ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <BookOpen className="h-4 w-4" />
            {t("visits.tabJournal", "Medical Journal & Records")}
          </button>
        </div>

        {/* Tab 1: Consultations & Visits */}
        {activeTab === "visits" && (
          <div>
            {loading ? (
              <div className="p-12 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
                <Stethoscope className="h-5 w-5 animate-pulse text-primary" />
                {t("dashboard.loading")}
              </div>
            ) : failed ? (
              <Card className="space-y-3 p-6">
                <p role="alert">{t("history.unavailable")}</p>
                <Button onClick={() => { setLoading(true); setAttempt((value) => value + 1); }}>{t("history.retry")}</Button>
              </Card>
            ) : visits.length === 0 ? (
              <Card className="p-10 text-center bg-card space-y-3">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <h3 className="font-semibold text-base">You have no visits yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Once you book and complete a video consultation, your clinical notes, instructions, and medical
                  journal will appear here.
                </p>
                <Button onClick={() => navigate("/registration")} className="mt-2">
                  Book your first consultation
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {orderedVisits.map((v) => (
                  <Card key={v.id} className="p-5 sm:p-6 space-y-4 bg-card hover:shadow-md transition-shadow">
                    {/* Card Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Stethoscope className="h-4 w-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-base">
                            {v.reason_category
                              ? t(`medicalReason.categories.${v.reason_category}`)
                              : "General Consultation"}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {v.created_at
                              ? new Date(v.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        {getStatusBadge(v.status)}
                      </div>
                    </div>

                    {/* Active visits lead; ready rooms can be joined directly. */}
                    {isActiveVisit(v) && (
                      <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium text-xs text-primary">Consultation in progress or waiting</p>
                          <p className="text-[11px] text-muted-foreground">Join room to meet your doctor.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => navigate(activeVisitPath(v))} className="gap-2 font-semibold shadow-sm text-xs">
                            <Video className="h-3.5 w-3.5" />
                            {t(v.room_url && v.status !== "pending" ? "history.join" : "history.resume")}
                          </Button>
                          {canCancelWaitingBooking(v) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={cancel.isPending}>{t("history.cancel")}</Button></AlertDialogTrigger>
                              <AlertDialogContent className="w-[calc(100%-2rem)] rounded-lg">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("history.confirmCancel")}</AlertDialogTitle>
                                  <AlertDialogDescription>{t("history.cancelLimit")}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("history.keep")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => cancel.mutate(v.id)}>{t("history.cancel")}</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Doctor Consultation Summary */}
                    {v.visit_summary && v.visit_summary_approved_at ? (
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Attending Doctor Summary & Instructions
                        </span>
                        <SummaryView s={v.visit_summary} onBookFollowUp={v.status === "completed" ? bookFollowUp : undefined} />
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground bg-muted/20">
                        {v.status === "completed"
                          ? "Your doctor completed this consultation. Notes are documented in your medical journal."
                          : "Consultation notes will appear here once reviewed by your doctor."}
                      </div>
                    )}

                    {/* Action row */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground">Visit ID: {v.id.slice(0, 8)}…</span>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setJournalFilter(v.id);
                          setActiveTab("journal");
                        }}
                        className="gap-1.5 text-xs font-medium"
                      >
                        <BookOpen className="h-3.5 w-3.5 text-primary" />
                        View in medical journal
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Medical Journal & Records */}
        {activeTab === "journal" && (
          <Card className="p-6 bg-card space-y-6">
            <div className="border-b pb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                {t("visits.tabJournal", "My Medical Journal")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Your personal clinical records, diagnoses, treatments, and physician notes across all your
                consultations.
              </p>
            </div>

            {visits.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground space-y-2">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium">No medical journal entries yet</p>
                <p className="text-xs">
                  Once a doctor completes a consultation with you, your personal journal entries will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Filter Selector */}
                <div className="flex flex-wrap items-center gap-2 border-b pb-4">
                  <span className="text-xs text-muted-foreground font-medium me-1">
                    {t("visits.filterByVisit", "Filter:")}
                  </span>

                  {/* All my records button */}
                  <button
                    type="button"
                    onClick={() => setJournalFilter("all")}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5",
                      journalFilter === "all"
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted/40 hover:bg-muted text-foreground border-border",
                    )}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {t("visits.allRecords", "All my records")}
                  </button>

                  {/* Individual consultation buttons */}
                  {visits.map((v, idx) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setJournalFilter(v.id)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                        journalFilter === v.id
                          ? "bg-primary text-primary-foreground border-primary shadow-sm font-semibold"
                          : "bg-muted/40 hover:bg-muted text-foreground border-border",
                      )}
                    >
                      <Stethoscope className="h-3 w-3" />
                      <span>
                        {v.reason_category
                          ? t(`medicalReason.categories.${v.reason_category}`, v.reason_category)
                          : `Visit #${visits.length - idx}`}
                      </span>
                      {v.created_at && (
                        <span className="opacity-75 text-[11px]">
                          · {new Date(v.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <PatientJournal
                  key={visits[0].id}
                  consultationId={visits[0].id}
                  filterConsultationId={journalFilter}
                  visitsList={visits}
                  hideHeader
                  onClearFilter={() => setJournalFilter("all")}
                />
              </div>
            )}
          </Card>
        )}
      </main>
    </div>
  );
};

export default function MyVisits() {
  return <LiveMyVisits />;
}
