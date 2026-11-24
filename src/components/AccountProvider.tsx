import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { bookingReturnPath } from "@/lib/booking-intake";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { accountDestination, type AccountAccess } from "@/lib/account-access";
import { Button } from "@/components/ui/button";
import { onForeground } from "@/lib/foreground";

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
  const accountId = useRef<string | null>(null);
  const latestCheck = useRef(0);

  const refresh = useCallback(async (background = false) => {
    const check = ++latestCheck.current;
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (check !== latestCheck.current) return;
      if (error && error.name !== "AuthSessionMissingError") throw error;
      if (!user) {
        accountId.current = null;
        setState({ user: null, access: null, loading: false, error: "" });
        return;
      }

      if (accountId.current !== user.id) {
        accountId.current = user.id;
        setState({ user: null, access: null, loading: true, error: "" });
      }

      const { data: access, error: accessError } = await supabase.rpc("my_account_access");
      if (check !== latestCheck.current) return;
      if (accessError || (access !== "patient" && access !== "pending" && access !== "doctor" && access !== "admin")) {
        throw new Error("Account access unavailable");
      }
      setState({ user, access, loading: false, error: "" });
    } catch {
      if (check !== latestCheck.current) return;
      if (background && stateRef.current.user?.id === accountId.current) {
        // A transient revalidation failure must not unmount an active call or form.
        return;
      }
      accountId.current = null;
      setState({ user: null, access: null, loading: false, error: "Your account access could not be checked." });
    }
  }, []);

  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      clearTimeout(scheduled);
      const nextId = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || !nextId) {
        latestCheck.current++;
        accountId.current = null;
        setState({ user: null, access: null, loading: false, error: "" });
        return;
      }
      if (nextId !== accountId.current) {
        latestCheck.current++;
        accountId.current = nextId;
        setState({ user: null, access: null, loading: true, error: "" });
      }
      scheduled = setTimeout(() => {
        void refresh(stateRef.current.user?.id === nextId);
      }, 0);
    });

    void refresh(false);
    const unsubscribe = onForeground(() => {
      void refresh(!!stateRef.current.user);
    });

    return () => {
      latestCheck.current++;
      clearTimeout(scheduled);
      subscription.unsubscribe();
      unsubscribe();
    };
  }, [refresh]);

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
    return <Navigate to={`/auth?as=${role === "doctor" ? "doctor" : "patient"}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`} replace />;
  }

  if (role && access !== role) {
    // Users with a pending doctor application retain full access to their patient visits and care.
    if (role === "patient" && access === "pending") {
      return <>{children}</>;
    }
    return <Navigate to={accountDestination(access)} replace />;
  }

  return <>{children}</>;
}
