import { useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useTranslation } from "react-i18next";

export const challengeSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function useAuthChallenge() {
  const widget = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState<string>();
  const [failed, setFailed] = useState(false);
  const { t, i18n } = useTranslation();
  const reset = () => {
    setToken(undefined);
    setFailed(false);
    widget.current?.reset();
  };
  const challenge = challengeSiteKey ? (
    <div className="space-y-2">
      <Turnstile ref={widget} siteKey={challengeSiteKey}
        options={{ size: "flexible", language: i18n.language === "ar" ? "ar" : "en" }}
        onSuccess={value => { setToken(value); setFailed(false); }}
        onExpire={() => setToken(undefined)}
        onError={() => { setToken(undefined); setFailed(true); }}
        scriptOptions={{ onError: () => setFailed(true) }} />
      {failed && <p role="alert" className="text-sm text-destructive">{t("challengeError")}</p>}
    </div>
  ) : null;
  return { challenge, token, ready: !challengeSiteKey || !!token, reset };
}
