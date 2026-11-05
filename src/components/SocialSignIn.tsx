import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import "@lovable.dev/cloud-auth-js/styles.css";

export default function SocialSignIn() {
  const [params] = useSearchParams();
  const signIn = async (provider: "google" | "lovable") => {
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: `${window.location.origin}/auth?as=${params.get("as") === "doctor" ? "doctor" : "patient"}` });
    if (result.error) toast.error("Could not sign in. Please try again.");
  };
  return <div className="space-y-3 border-t pt-4"><Button type="button" variant="outline" className="w-full" onClick={() => void signIn("google")}>Continue with Google</Button><Button type="button" variant="outline" className="lovable-auth-button w-full" onClick={() => void signIn("lovable")}>Continue with Lovable</Button></div>;
}