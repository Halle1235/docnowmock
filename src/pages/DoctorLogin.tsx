import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const DoctorLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if user has been verified as a doctor by an admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .eq("role", "doctor")
        .maybeSingle();

      if (!roleData) {
        await supabase.auth.signOut();
        throw new Error(
          "Detta konto är inte verifierat som läkare ännu. Kontakta administratören."
        );
      }


      toast({
        title: "Inloggning lyckades",
        description: "Välkommen tillbaka!",
      });

      navigate("/doctor/dashboard");
    } catch (error: any) {
      toast({
        title: "Inloggning misslyckades",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-primary">DocNow</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Stethoscope className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Läkarportal</h2>
            <p className="text-muted-foreground">
              Logga in för att hantera dina konsultationer
            </p>
          </div>

          <div className="bg-card p-8 rounded-xl border shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">E-postadress</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="din@email.se"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Lösenord</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-base"
                size="lg"
                disabled={loading}
              >
                {loading ? "Loggar in..." : "Logga in"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Button
                variant="link"
                className="p-0 h-auto text-sm text-muted-foreground"
                onClick={() => navigate("/reset-password")}
              >
                Glömt lösenord?
              </Button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Inte registrerad än?{" "}
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => navigate("/doctor/register")}
                >
                  Skapa läkarkonto
                </Button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorLogin;
