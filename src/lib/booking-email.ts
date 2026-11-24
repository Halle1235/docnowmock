import { supabase } from "@/integrations/supabase/client";

export async function sendBookingCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}
