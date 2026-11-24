import { supabase } from "@/integrations/supabase/client";

export async function sendBookingCode(email: string, captchaToken?: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, captchaToken },
  });
  if (error) throw error;
}
