import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Clock,
  CircleUserRound,
  User,
  LogOut,
  Video,
  CheckCircle2,
  Activity,
  Search,
  Stethoscope,
  BookOpen,
  Phone,
  FileText,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VisitSummaryDialog from "@/components/VisitSummaryDialog";
import PatientJournal from "@/components/PatientJournal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setMyDoctorAvailability } from "@/lib/booking-continuity";

interface Consultation {
  id: string;
  patient_id: string;
  status: string;
  payment_status: string;
  payment_amount: number;
  created_at: string;
  reason_category?: string;
  reason_description?: string;
  profiles: {
    full_name: string;
    phone: string;
  };
}

const LiveDoctorDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [doctorInfo, setDoctorInfo] = useState({
    fullName: "Doctor",
    specialization: "General Practice & Telehealth",
    licenseNumber: "",
    isAvailable: null as boolean | null,
  });
  const [journalId, setJournalId] = useState<string | null>(
    typeof location.state?.journalId === "string" ? location.state.journalId : null,
  );
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const [historySearch, setHistorySearch] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed">("all");

  const availability = useMutation({
    mutationFn: setMyDoctorAvailability,
    onSuccess: (_, isAvailable) => {
      setDoctorInfo(previous => ({ ...previous, isAvailable }));
      void queryClient.invalidateQueries({ queryKey: ["booking-availability"] });
    },
    onError: () => toast({ title: t("availability.updateError"), variant: "destructive" }),
  });

  useBookingNotifications("doctor", consultations, !loading);

  useEffect(() => {
    checkAuth().then((allowed) => {
      if (allowed) loadConsultations();
    });

    const channel = supabase
      .channel("consultations-doctor-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "consultations" }, () => {
        loadConsultations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      navigate("/auth");
      return false;
    }

    setUserEmail(user.email || "");

    const [verifiedRes, profileRes, docProfileRes] = await Promise.all([
      supabase.rpc("is_authorized_doctor", { _user_id: user.id }),
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      supabase
        .from("doctor_profiles")
        .select("specialization, license_number, is_available")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (verifiedRes.error || !verifiedRes.data) {
      toast({
        title: "Access denied",
        description: "Your doctor account has not been approved by an administrator yet.",
        variant: "destructive",
      });
      navigate("/my-visits");
      return false;
    }

    setDoctorInfo({
      fullName: profileRes.data?.full_name || user.email?.split("@")[0] || "Doctor",
      specialization: docProfileRes.data?.specialization || "Telehealth Practitioner",
      licenseNumber: docProfileRes.data?.license_number || "",
      isAvailable: docProfileRes.data?.is_available ?? null,
    });

    return true;
  };

  const loadConsultations = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc("list_doctor_consultations");

      if (error) throw error;

      setConsultations(Array.isArray(data) ? (data as unknown as Consultation[]) : []);
    } catch (error: any) {
      toast({
        title: t("dashboard.couldNotLoad"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  const claimConsultation = async (consultationId: string) => {
    if (claimInFlight.current) return;
    claimInFlight.current = true;
    setClaimingId(consultationId);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.rpc("claim_patient_consultation", { _consultation_id: consultationId });

      if (error) throw error;

      toast({
        title: t("dashboard.consultationAssigned"),
        description: t("dashboard.canStartVideo"),
      });

      loadConsultations();
    } catch (error: any) {
      toast({
        title: error.code === "40001" ? "Consultation already taken" : t("dashboard.couldNotAssign"),
        description:
          error.code === "40001"
            ? "Another doctor has taken this booking. The queue has been refreshed."
            : error.message,
        variant: "destructive",
      });
      await loadConsultations();
    } finally {
      claimInFlight.current = false;
      setClaimingId(null);
    }
  };

  useEffect(() => {
    const refresh = () => {
      void loadConsultations();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const startVideo = (consultationId: string) => {
    navigate(`/call/${consultationId}`);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_progress":
        return (
          <Badge className="bg-primary/15 text-primary border-primary/30 flex items-center gap-1.5 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            {t(`status.${status}`)}
          </Badge>
        );
      case "claimed":
        return (
          <Badge
            variant="secondary"
            className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 flex items-center gap-1.5 font-medium"
          >
            <Clock className="h-3 w-3" />
            {t(`status.${status}`)}
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            {t(`status.${status}`)}
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="destructive" className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-3 w-3" />
            {t(`status.${status}`)}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="font-medium">
            {t(`status.${status}`)}
          </Badge>
        );
    }
  };

  // Filter derivations
  const pendingConsultations = useMemo(() => consultations.filter((c) => c.status === "pending"), [consultations]);
  const myConsultations = useMemo(() => consultations.filter((c) => c.status !== "pending"), [consultations]);
  const activeConsultations = useMemo(
    () => consultations.filter((c) => ["claimed", "in_progress"].includes(c.status)),
    [consultations],
  );
  const completedConsultations = useMemo(() => consultations.filter((c) => c.status === "completed"), [consultations]);

  const filteredConsultations = useMemo(() => {
    return myConsultations.filter((c) => {
      if (activeTab === "active" && !["claimed", "in_progress"].includes(c.status)) return false;
      if (activeTab === "completed" && c.status !== "completed") return false;

      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase();
        const patientName = (c.profiles?.full_name || "").toLowerCase();
        const phone = (c.profiles?.phone || "").toLowerCase();
        const reasonCat = (c.reason_category || "").toLowerCase();
        const reasonDesc = (c.reason_description || "").toLowerCase();
        return patientName.includes(q) || phone.includes(q) || reasonCat.includes(q) || reasonDesc.includes(q);
      }
      return true;
    });
  }, [myConsultations, activeTab, historySearch]);

  const todayFormatted = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary animate-pulse">
          <Stethoscope className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">{t("dashboard.loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2 sm:px-6 sm:py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-primary">DocNow</span>
              <Badge variant="outline" className="ms-2 border-primary/20 text-xs text-primary font-medium">
                Doctor Portal
              </Badge>
            </div>
          </div>

          <div className="flex items-center sm:gap-2">
            <BookingNotifications role="doctor" />
            <LanguageSwitcher />

            <DropdownMenu dir={i18n.dir()}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("header.account")}><CircleUserRound /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
                {userEmail && <DropdownMenuLabel className="break-all text-muted-foreground" dir="ltr">{userEmail}</DropdownMenuLabel>}
                <DropdownMenuItem onSelect={() => void handleLogout()} className="gap-2">
                  <LogOut aria-hidden="true" className="h-4 w-4" />{t("header.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:py-8 space-y-7">
        {/* Clinician Welcome & Status Banner */}
        <div className="rounded-2xl border bg-card p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 shrink-0 border-2 border-primary/20 shadow-sm">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
                  {doctorInfo.fullName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="min-w-0 text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">Dr. {doctorInfo.fullName}</h1>
                  <Badge variant={doctorInfo.isAvailable ? "default" : "secondary"}>
                    {t(doctorInfo.isAvailable === null ? "availability.unknown" : doctorInfo.isAvailable ? "availability.accepting" : "availability.paused")}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere] sm:text-sm">
                  {doctorInfo.specialization}{doctorInfo.licenseNumber && ` · ${doctorInfo.licenseNumber}`}
                </p>
              </div>
            </div>

            <div className="flex items-center sm:flex-col sm:items-end justify-between border-t sm:border-t-0 pt-3 sm:pt-0 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground">{todayFormatted}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 ms-2"
                  onClick={() => loadConsultations(true)}
                  disabled={refreshing}
                  title="Refresh queue"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                </Button>
              </div>
              <span className="text-[11px] mt-0.5">Dubai, United Arab Emirates (GST)</span>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3" disabled={availability.isPending}
            onClick={() => availability.mutate(!doctorInfo.isAvailable)}>
            {t(doctorInfo.isAvailable ? "availability.pause" : "availability.start")}
          </Button>
        </div>

        {/* Top 4 KPI Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Waiting in Queue */}
          <Card
            className={cn(
              "p-4 border transition-all",
              pendingConsultations.length > 0 ? "border-amber-500/40 bg-amber-500/5 shadow-sm" : "bg-card",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("dashboard.inQueue", "Waiting in Queue")}
              </span>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  pendingConsultations.length > 0
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{pendingConsultations.length}</span>
              <span className="text-[11px] text-muted-foreground">
                {pendingConsultations.length === 1 ? "patient" : "patients"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              {pendingConsultations.length > 0 ? "Requires doctor attention" : "Queue is clear"}
            </p>
          </Card>

          {/* 2. In Progress / In Call */}
          <Card
            className={cn(
              "p-4 border transition-all",
              activeConsultations.length > 0 ? "border-primary/40 bg-primary/5 shadow-sm" : "bg-card",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("dashboard.inProgress", "In Progress")}
              </span>
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  activeConsultations.length > 0 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Video className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{activeConsultations.length}</span>
              <span className="text-[11px] text-muted-foreground">
                {activeConsultations.length === 1 ? "active call" : "active calls"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">
              {activeConsultations.length > 0 ? "Call ready to join" : "No active calls"}
            </p>
          </Card>

          {/* 3. Completed Visits */}
          <Card className="p-4 border bg-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{t("dashboard.completed", "Completed")}</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{completedConsultations.length}</span>
              <span className="text-[11px] text-muted-foreground">visits</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">Documented in journal</p>
          </Card>

          {/* 4. Total Consultations */}
          <Card className="p-4 border bg-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t("dashboard.totalVisits", "Total Consultations")}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight">{myConsultations.length}</span>
              <span className="text-[11px] text-muted-foreground">records</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground truncate">All assigned consultations</p>
          </Card>
        </div>

        <div className="space-y-7">
          {/* Section 1: Pending Consultations Queue */}
          <div>
            <div className="mb-3.5 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                {t("dashboard.pendingTitle")} ({pendingConsultations.length})
              </h2>
              {pendingConsultations.length > 0 && (
                <Badge variant="outline" className="border-amber-500/30 text-amber-600 bg-amber-500/10 text-xs">
                  Action required
                </Badge>
              )}
            </div>

            {pendingConsultations.length === 0 ? (
              <Card className="p-6 text-center border-dashed bg-card/60">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-3">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold">{t("dashboard.queueClear", "Queue is clear")}</h3>
                <p className="mt-1 max-w-md mx-auto text-xs text-muted-foreground">
                  {t(
                    "dashboard.queueClearDesc",
                    "No patients are currently waiting. You will receive an audio chime and notification the moment a new booking arrives.",
                  )}
                </p>
                <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Real-time queue listener active</span>
                </div>
              </Card>
            ) : (
              <div className="space-y-3.5">
                {pendingConsultations.map((consultation) => (
                  <Card
                    key={consultation.id}
                    className="p-5 border-amber-500/40 bg-amber-500/[0.03] shadow-sm hover:shadow transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2.5 break-words">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-amber-500/30">
                            <AvatarFallback className="bg-amber-500/10 text-amber-700 font-semibold text-xs">
                              {(consultation.profiles?.full_name || "P").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h4 className="font-semibold text-base">
                              {consultation.profiles?.full_name || t("dashboard.patient")}
                            </h4>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {consultation.profiles?.phone || t("dashboard.notProvided")}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 text-amber-600 bg-amber-500/10 ms-auto sm:ms-2 text-xs"
                          >
                            Waiting
                          </Badge>
                        </div>

                        {consultation.reason_category && (
                          <div className="p-3 bg-card rounded-xl border text-xs space-y-1">
                            <div className="font-semibold text-primary">
                              {t("dashboard.reason")}: {t(`medicalReason.categories.${consultation.reason_category}`)}
                            </div>
                            {consultation.reason_description && (
                              <p className="text-muted-foreground">
                                {t("dashboard.symptoms")}: {consultation.reason_description}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {t("dashboard.payment")}: {consultation.payment_amount} AED
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(consultation.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      <Button
                        onClick={() => claimConsultation(consultation.id)}
                        disabled={claimingId !== null || doctorInfo.isAvailable === false}
                        className="sm:self-center shrink-0 gap-2 shadow-sm font-semibold"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {claimingId === consultation.id ? t("dashboard.assigning") : t("dashboard.takeConsultation")}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: My Consultations & Patient Records */}
          <div>
            <div className="mb-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  {t("dashboard.myConsultationsTitle")} ({myConsultations.length})
                </h2>

                {/* Filter Tabs */}
                <div className="flex rounded-xl border bg-card p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("all")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition-colors",
                      activeTab === "all"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("dashboard.allTab", "All")} ({myConsultations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("active")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition-colors",
                      activeTab === "active"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("dashboard.activeTab", "Active")} ({activeConsultations.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("completed")}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-medium transition-colors",
                      activeTab === "completed"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("dashboard.completedTab", "Completed")} ({completedConsultations.length})
                  </button>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="live-history-search"
                  className="ps-9 rounded-xl bg-card border text-xs sm:text-sm h-10"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder={t("dashboard.searchPlaceholder", "Search by patient name, phone, or symptoms...")}
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch("")}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {filteredConsultations.length === 0 ? (
              <Card className="p-8 text-center bg-card">
                <p className="text-muted-foreground text-sm">
                  {historySearch ? "No consultations match your search." : t("dashboard.noAssigned")}
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredConsultations.map((consultation) => (
                  <Card key={consultation.id} className="p-5 bg-card hover:shadow-md transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-3 break-words">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border border-primary/20">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                              {(consultation.profiles?.full_name || "P").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-base">
                                {consultation.profiles?.full_name || t("dashboard.patient")}
                              </h4>
                              {getStatusBadge(consultation.status)}
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {consultation.profiles?.phone || t("dashboard.notProvided")}
                            </p>
                          </div>
                        </div>

                        {consultation.reason_category && (
                          <div className="p-3 bg-muted/40 rounded-xl border border-border/50 text-xs space-y-1">
                            <div className="font-semibold text-primary">
                              {t("dashboard.reason")}: {t(`medicalReason.categories.${consultation.reason_category}`)}
                            </div>
                            {consultation.reason_description && (
                              <p className="text-muted-foreground">
                                {t("dashboard.symptoms")}: {consultation.reason_description}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {t("dashboard.payment")}: {consultation.payment_amount} AED
                          </span>
                          {consultation.payment_status === "pending" && (
                            <Badge variant="outline" className="text-[10px]">
                              {t("payment.unpaid")}
                            </Badge>
                          )}
                          <span>•</span>
                          <span>
                            {new Date(consultation.created_at).toLocaleString([], {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 shrink-0 sm:items-end border-t sm:border-t-0 pt-3 sm:pt-0 [&>button]:min-h-11 sm:[&>button]:min-h-0">
                        {["claimed", "in_progress"].includes(consultation.status) && (
                          <Button
                            onClick={() => startVideo(consultation.id)}
                            className="w-full gap-2 shadow-sm font-semibold"
                          >
                            <Video className="h-4 w-4" />
                            {consultation.status === "in_progress"
                              ? t("dashboard.rejoinVideo")
                              : t("dashboard.startVideo")}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          onClick={() => setJournalId(consultation.id)}
                        >
                          <BookOpen className="h-3.5 w-3.5 text-primary" />
                          Patient journal
                        </Button>
                        <VisitSummaryDialog
                          consultationId={consultation.id}
                          initialNotes={(consultation as any).notes}
                          initialSummary={(consultation as any).visit_summary}
                          onSaved={() => loadConsultations()}
                        />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Patient Journal Modal Dialog */}
      <Dialog
        open={!!journalId}
        onOpenChange={(open) => {
          if (!open) setJournalId(null);
        }}
      >
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>Patient medical journal</DialogTitle>
          </DialogHeader>
          {journalId && (
            <PatientJournal
              key={journalId}
              consultationId={journalId}
              canAdd={consultations.some(
                (c) => c.id === journalId && ["claimed", "in_progress", "completed"].includes(c.status),
              )}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const DoctorDashboard = () => <LiveDoctorDashboard />;
export default DoctorDashboard;
