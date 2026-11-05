import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { accountAccess, accountDestination, type AccountAccess } from "@/lib/account-access";
import { Button } from "@/components/ui/button";

const AccountContext = createContext<{ user: User | null; access: AccountAccess | null; loading: boolean; error: string; refresh: () => Promise<void> }>({ user: null, access: null, loading: true, error: "", refresh: async () => {} });
export const useAccount = () => useContext(AccountContext);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null; access: AccountAccess | null; loading: boolean; error: string }>({ user: null, access: null, loading: true, error: "" });
  const refresh = async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user) { setState({ user: null, access: null, loading: false, error: "" }); return; }
      if (error) throw error;
      const [roles, doctor] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("doctor_profiles").select("is_verified").eq("user_id", user.id).maybeSingle(),
      ]);
      if (roles.error || doctor.error) throw roles.error || doctor.error;
      setState({ user, access: accountAccess((roles.data ?? []).map(r => r.role), doctor.data?.is_verified === true, !!doctor.data), loading: false, error: "" });
    } catch { setState({ user: null, access: null, loading: false, error: "Your account access could not be checked." }); }
  };
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setState({ user: null, access: null, loading: true, error: "" });
      setTimeout(() => { void refresh(); }, 0);
    });
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60000);
    return () => { subscription.unsubscribe(); window.removeEventListener("focus", focus); clearInterval(timer); };
  }, []);
  return <AccountContext.Provider value={{ ...state, refresh }}>{children}</AccountContext.Provider>;
}
export function RequireAccount({ children, role }: { children: ReactNode; role?: AccountAccess }) {
  const { user, access, loading, error, refresh } = useAccount();
  if (loading) return <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking account…</div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-background"><div className="text-center space-y-4"><p role="alert">{error}</p><Button onClick={() => void refresh()}>Retry</Button></div></div>;
  if (!user || !access) return <Navigate to="/auth?as=patient" replace />;
  if (role && access !== role) return <Navigate to={accountDestination(access)} replace />;
  return <>{children}</>;
}