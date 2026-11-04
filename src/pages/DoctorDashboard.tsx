import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Clock, User, LogOut, Video, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VisitSummaryDialog from "@/components/VisitSummaryDialog";
import PatientJournal from "@/components/PatientJournal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import DoctorWorkspace from "@/components/DoctorWorkspace";
import { MOCK_LOGIN_ENABLED, SAMPLE_CONSULTATION, demoCallPath } from "@/lib/mock-login";
import BookingNotifications from "@/components/BookingNotifications";
import { useBookingNotifications } from "@/hooks/use-booking-notifications";

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
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [journalId, setJournalId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const claimInFlight = useRef(false);
  const [historySearch, setHistorySearch] = useState("");
  useBookingNotifications("doctor", consultations, !loading);

  useEffect(() => {
    if (MOCK_LOGIN_ENABLED) {
      // Demo: sample patients only, no real records.
      setUserEmail("Demo doctor");
      setConsultations([SAMPLE_CONSULTATION as Consultation]);
      setLoading(false);
      return;
    }
    checkAuth().then((allowed) => { if (allowed) loadConsultations(); });

    const channel = supabase
      .channel('consultations-doctor-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consultations' },
        () => {
          loadConsultations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return false;
    }

    setUserEmail(session.user.email || "");

    const { data: verified, error } = await supabase.rpc('is_authorized_doctor', { _user_id: session.user.id });

    if (error || !verified) {
      toast({
        title: "Åtkomst nekad",
        description: "Ditt läkarkonto är inte verifierat än.",
        variant: "destructive",
      });
      navigate("/my-visits");
      return false;
    }
    return true;
  };

  const loadConsultations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.rpc('list_doctor_consultations');

      if (error) throw error;

      setConsultations(Array.isArray(data) ? data as unknown as Consultation[] : []);
    } catch (error: any) {
      toast({
        title: t('dashboard.couldNotLoad'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const claimConsultation = async (consultationId: string) => {
    if (claimInFlight.current) return;
    if (MOCK_LOGIN_ENABLED) {
      setConsultations((cs) => cs.map((c) => c.id === consultationId ? { ...c, status: "claimed" } : c));
      return;
    }
    claimInFlight.current = true;
    setClaimingId(consultationId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.rpc('claim_patient_consultation', { _consultation_id: consultationId });

      if (error) throw error;

      toast({
        title: t('dashboard.consultationAssigned'),
        description: t('dashboard.canStartVideo'),
      });

      loadConsultations();
    } catch (error: any) {
      toast({
        title: error.code === "40001" ? "Consultation already taken" : t('dashboard.couldNotAssign'),
        description: error.code === "40001" ? "Another doctor has taken this booking. The queue has been refreshed." : error.message,
        variant: "destructive",
      });
      await loadConsultations();
    } finally {
      claimInFlight.current = false;
      setClaimingId(null);
    }
  };

  useEffect(() => {
    const refresh = () => { void loadConsultations(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);

  const startVideo = (consultationId: string) => {
    navigate(MOCK_LOGIN_ENABLED ? demoCallPath("doctor") : `/call/${consultationId}`);
  };

  const handleLogout = async () => {
    if (!MOCK_LOGIN_ENABLED) await supabase.auth.signOut();
    navigate("/auth");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "outline",
      claimed: "secondary",
      in_progress: "default",
      completed: "default",
      cancelled: "destructive"
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {t(`status.${status}`)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('dashboard.loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">{t('header.doctors')}</h1>
            <div className="flex items-center gap-4">
              <BookingNotifications role="doctor" />
              <LanguageSwitcher />
              <span className="text-sm text-muted-foreground">{userEmail}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                {t('header.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">{t('dashboard.title')}</h2>
            <p className="text-muted-foreground">
              {t('dashboard.subtitle')}
            </p>
          </div>

          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {t('dashboard.pendingTitle')} ({consultations.filter(c => c.status === 'pending').length})
            </h3>
            
            <div className="space-y-4">
              {consultations.filter(c => c.status === 'pending').length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">{t('dashboard.noPending')}</p>
                </Card>
              ) : (
                consultations
                  .filter(c => c.status === 'pending')
                  .map((consultation) => (
                     <Card key={consultation.id} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <h4 className="font-semibold">{consultation.profiles?.full_name || t('dashboard.patient')}</h4>
                              <p className="text-sm text-muted-foreground">
                                {t('dashboard.phone')}: {consultation.profiles?.phone || t('dashboard.notProvided')}
                              </p>
                            </div>
                          </div>
                          
                          {consultation.reason_category && (
                            <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                              <div className="font-medium text-sm mb-1">
                                {t('dashboard.reason')}: {t(`medicalReason.categories.${consultation.reason_category}`)}
                              </div>
                              {consultation.reason_description && (
                                <div className="text-sm text-muted-foreground">
                                  {t('dashboard.symptoms')}: {consultation.reason_description}
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>{t('dashboard.payment')}: {consultation.payment_amount}  AED</span>
                            <span>{t('dashboard.status')}: {getStatusBadge(consultation.payment_status)}</span>
                            <span>{t('dashboard.created')}: {new Date(consultation.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        <Button
                          onClick={() => claimConsultation(consultation.id)}
                          disabled={claimingId !== null}
                          className="ml-4"
                        >
                          {claimingId === consultation.id ? t('dashboard.assigning') : t('dashboard.takeConsultation')}
                        </Button>
                      </div>
                    </Card>
                  ))
              )}
            </div>
          </div>

          <div>
            <div className="mb-4"><label htmlFor="live-history-search" className="text-sm font-medium">Search patient history</label><Input id="live-history-search" className="mt-2" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="Patient name" /></div>
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-primary" />
              {t('dashboard.myConsultationsTitle')} ({consultations.filter(c => c.status !== 'pending').length})
            </h3>
            
            <div className="space-y-4">
              {consultations.filter(c => c.status !== 'pending').length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">{t('dashboard.noAssigned')}</p>
                </Card>
              ) : (
                consultations
                  .filter(c => c.status !== 'pending' && (c.profiles?.full_name || "").toLocaleLowerCase().includes(historySearch.trim().toLocaleLowerCase()))
                  .map((consultation) => (
                    <Card key={consultation.id} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <h4 className="font-semibold">{consultation.profiles?.full_name || t('dashboard.patient')}</h4>
                              <p className="text-sm text-muted-foreground">
                                {t('dashboard.phone')}: {consultation.profiles?.phone || t('dashboard.notProvided')}
                              </p>
                            </div>
                            {getStatusBadge(consultation.status)}
                          </div>
                          
                          {consultation.reason_category && (
                            <div className="mb-3 p-3 bg-muted/50 rounded-lg">
                              <div className="font-medium text-sm mb-1">
                                {t('dashboard.reason')}: {t(`medicalReason.categories.${consultation.reason_category}`)}
                              </div>
                              {consultation.reason_description && (
                                <div className="text-sm text-muted-foreground">
                                  {t('dashboard.symptoms')}: {consultation.reason_description}
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>{t('dashboard.payment')}: {consultation.payment_amount}  AED</span>
                            <span>{t('dashboard.created')}: {new Date(consultation.created_at).toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="ml-4 flex flex-col gap-2 items-end"><Button variant="outline" onClick={() => setJournalId(consultation.id)}>Patient journal</Button>
                          {consultation.status === 'claimed' && (
                            <Button onClick={() => startVideo(consultation.id)}>
                              <Video className="h-4 w-4 mr-2" />
                              {t('dashboard.startVideo')}
                            </Button>
                          )}
                          {!MOCK_LOGIN_ENABLED && <VisitSummaryDialog
                            consultationId={consultation.id}
                            initialNotes={(consultation as any).notes}
                            initialSummary={(consultation as any).visit_summary}
                            onSaved={loadConsultations}
                          />}
                        </div>
                      </div>
                    </Card>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={!!journalId} onOpenChange={open => { if (!open) setJournalId(null); }}><DialogContent className="w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}><DialogHeader><DialogTitle>Patient medical journal</DialogTitle></DialogHeader>{journalId && <PatientJournal key={journalId} consultationId={journalId} canAdd={consultations.some(c => c.id === journalId && ["claimed", "in_progress"].includes(c.status))} />}</DialogContent></Dialog>
    </div>
  );
};

const DoctorDashboard = () => MOCK_LOGIN_ENABLED ? <DoctorWorkspace /> : <LiveDoctorDashboard />;
export default DoctorDashboard;
