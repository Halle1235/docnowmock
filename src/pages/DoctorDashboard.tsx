import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Clock, User, LogOut, Video, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import VisitSummaryDialog from "@/components/VisitSummaryDialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MOCK_LOGIN_ENABLED, SAMPLE_CONSULTATION, demoCallPath } from "@/lib/mock-login";

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
    age?: number | null;
    allergies?: string | null;
  };
}

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);

  useEffect(() => {
    if (MOCK_LOGIN_ENABLED) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("doctor_profiles")
        .select("is_available")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data) setIsOnline(data.is_available !== false);
    })();
  }, []);

  const toggleOnline = async (next: boolean) => {
    if (MOCK_LOGIN_ENABLED) { setIsOnline(next); return; }
    setSavingOnline(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSavingOnline(false); return; }
    // Database rules only let a doctor change their own row.
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ is_available: next })
      .eq("user_id", session.user.id);
    setSavingOnline(false);
    if (error) {
      toast({ title: "Could not update your status", description: error.message, variant: "destructive" });
      return;
    }
    setIsOnline(next);
  };

  useEffect(() => {
    if (MOCK_LOGIN_ENABLED) {
      // Demo: sample patients only, no real records.
      setUserEmail("Demo doctor");
      setConsultations([SAMPLE_CONSULTATION as Consultation]);
      setLoading(false);
      return;
    }
    checkAuth();
    loadConsultations();

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
      return;
    }

    setUserEmail(session.user.email || "");

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('role', 'doctor')
      .maybeSingle();

    if (!roles) {
      toast({
        title: "Åtkomst nekad",
        description: "Ditt läkarkonto är inte verifierat än.",
        variant: "destructive",
      });
      navigate("/my-visits");
    }

  };

  const loadConsultations = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('consultations')
        .select('*')
        .or(`status.eq.pending,doctor_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Patient details come from a limited, server-checked lookup: only for
      // consultations this doctor can see, and never passport or full birth date.
      const merged = await Promise.all((data || []).map(async (c: any) => {
        const { data: p } = await supabase.rpc('get_consultation_patient', { _consultation_id: c.id });
        const info = (p ?? {}) as { full_name?: string; phone?: string; age?: number | null; allergies?: string | null };
        return {
          ...c,
          profiles: { full_name: info.full_name || '', phone: info.phone || '', age: info.age ?? null, allergies: info.allergies ?? null },
        };
      }));

      setConsultations(merged as any);
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
    if (MOCK_LOGIN_ENABLED) {
      setConsultations((cs) => cs.map((c) => c.id === consultationId ? { ...c, status: "claimed" } : c));
      return;
    }
    setClaimingId(consultationId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('consultations')
        .update({
          doctor_id: session.user.id,
          status: 'claimed',
          claimed_at: new Date().toISOString()
        })
        .eq('id', consultationId)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: t('dashboard.consultationAssigned'),
        description: t('dashboard.canStartVideo'),
      });

      loadConsultations();
    } catch (error: any) {
      toast({
        title: t('dashboard.couldNotAssign'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setClaimingId(null);
    }
  };

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
              <div className="flex items-center gap-2">
                <Switch
                  id="online-switch"
                  checked={isOnline}
                  disabled={savingOnline}
                  onCheckedChange={toggleOnline}
                  aria-label="Available for new patients"
                />
                <Label htmlFor="online-switch" className="text-sm">
                  {isOnline ? "Online" : "Offline"}
                </Label>
              </div>
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

          {!isOnline && (
            <Card className="mb-6 p-4 text-sm text-muted-foreground">
              You're offline. You won't be counted as available and can't take new patients until you go online.
            </Card>
          )}

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
                          disabled={claimingId === consultation.id || !isOnline}
                          title={!isOnline ? "Go online to take new patients" : undefined}
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
                  .filter(c => c.status !== 'pending')
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

                        <div className="ml-4 flex flex-col gap-2 items-end">
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
    </div>
  );
};

export default DoctorDashboard;
