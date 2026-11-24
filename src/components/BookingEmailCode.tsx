import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { sendBookingCode } from "@/lib/booking-email";

interface Props {
  email: string;
  sentAt: number;
  sendFailed: boolean;
  onEditEmail: () => void;
  onPasswordLogin: () => void;
}

export default function BookingEmailCode({ email, sentAt, sendFailed, onEditEmail, onPasswordLogin }: Props) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(!!sentAt);
  const [lastSent, setLastSent] = useState(sentAt);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState(sendFailed ? "bookingEmail.sendError" : "");
  const inFlight = useRef(false);
  const remaining = Math.max(0, Math.ceil((lastSent + 60_000 - now) / 1000));

  useEffect(() => {
    if (!lastSent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lastSent]);

  const resend = async () => {
    if (inFlight.current || remaining > 0) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await sendBookingCode(email);
      const time = Date.now();
      setToken("");
      setLastSent(time);
      setNow(time);
      setSent(true);
    } catch {
      setError("bookingEmail.sendError");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || !/^\d{6}$/.test(token)) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: verificationError } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (verificationError || !data.session) throw new Error();
      // Auth.tsx advances after the shared account provider validates this session.
      setToken("");
    } catch {
      setError("bookingEmail.invalid");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p role="status" className="break-words text-sm text-muted-foreground">
        {sent ? t("bookingEmail.sent") : t("bookingEmail.recipient")} <bdi>{email}</bdi>
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
      {sent && (
        <form className="space-y-3" onSubmit={verify}>
          <Label htmlFor="booking-email-code">{t("bookingEmail.label")}</Label>
          <Input id="booking-email-code" autoComplete="one-time-code" inputMode="numeric" dir="ltr"
            required pattern="[0-9]{6}" maxLength={6} value={token}
            onChange={event => setToken(event.target.value.replace(/[^0-9]/g, ""))} />
          <Button type="submit" className="w-full" disabled={busy || token.length !== 6}>{t("bookingEmail.verify")}</Button>
        </form>
      )}
      <Button type="button" variant="outline" className="w-full" disabled={busy || remaining > 0} onClick={() => void resend()}>
        {remaining > 0 ? t("bookingEmail.resendTimer", { seconds: remaining }) : t(sent ? "bookingEmail.resend" : "bookingEmail.send")}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="link" className="px-0" disabled={busy} onClick={onEditEmail}>{t("bookingEmail.edit")}</Button>
        <Button type="button" variant="link" className="px-0" disabled={busy} onClick={onPasswordLogin}>{t("bookingEmail.usePassword")}</Button>
      </div>
    </div>
  );
}
