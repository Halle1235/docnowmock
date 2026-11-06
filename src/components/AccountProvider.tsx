import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { bookingReturnPath } from "@/lib/booking-intake";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { accountAccess, accountDestination, type AccountAccess } from "@/lib/account-access";
import { Button } from "@/components/ui/button";

interface AccountState {
  user: User | null;
  access: AccountAccess | null;
  loading: boolean;
  error: string;
}

const AccountContext = createContext<AccountState & { refresh: () => Promise<void> }>({
  user: null,
  access: null,
  loading: true,
  error: "",
  refresh: async () => {},
});

export const useAccount = () => useContext(AccountContext);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>({
    user: null,
    access: null,
    loading: true,
    error: "",
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = async (background = false) => {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (!user) {
        setState({ user: null, access: null, loading: false, error: "" });
        return;
      }
      if (error) throw error;

      const [roles, doctor] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("doctor_profiles").select("is_verified").eq("user_id", user.id).maybeSingle(),
      ]);

      if (roles.error || doctor.error) throw roles.error || doctor.error;

      const access = accountAccess(
        (roles.data ?? []).map((r) => r.role),
        doctor.data?.is_verified === true,
        !!doctor.data,
      );

      setState({ user, access, loading: false, error: "" });
    } catch {
      if (background && stateRef.current.user) {
        // Keep existing user and access during background refreshes on tab switch / window focus
        return;
      }
      setState({ user: null, access: null, loading: false, error: "Your account access could not be checked." });
    }
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({ user: null, access: null, loading: false, error: "" });
      } else if (event === "SIGNED_IN") {
        void refresh(false);
      } else {
        // TOKEN_REFRESHED, USER_UPDATED, etc. happen silently in the background
        void refresh(true);
      }
    });

    void refresh(false);

    const focus = () => {
      // Background check without resetting loading state or unmounting the screen
      void refresh(true);
    };

    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60000);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("focus", focus);
      clearInterval(timer);
    };
  }, []);

  return (
    <AccountContext.Provider value={{ ...state, refresh: () => refresh(false) }}>{children}</AccountContext.Provider>
  );
}

export function RequireAccount({ children, role }: { children: ReactNode; role?: AccountAccess }) {
  const location = useLocation();
  const { user, access, loading, error, refresh } = useAccount();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">Checking account…</div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-center space-y-4">
          <p role="alert">{error}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!user || !access) {
    const returnTo = bookingReturnPath(location.pathname + location.search);
    return <Navigate to={`/auth?as=patient${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`} replace />;
  }

  if (role && access !== role) {
    // Users with a pending doctor application retain full access to their patient visits and care
    if (role === "patient" && access === "pending") {
      return <>{children}</>;
    }
    return <Navigate to={accountDestination(access)} replace />;
  }

  return <>{children}</>;
}
