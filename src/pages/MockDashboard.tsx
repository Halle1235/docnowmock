import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarDays, LogOut, Shield, Stethoscope, User, Video } from "lucide-react";
import { isMockRole } from "@/lib/mock-login";

const views = {
  patient: { title: "My visits", icon: User, section: "Upcoming consultation", name: "Dr. Alex Morgan", detail: "General medicine · Video consultation" },
  doctor: { title: "Doctor dashboard", icon: Stethoscope, section: "Consultation queue", name: "Sample patient", detail: "General consultation · Waiting" },
  admin: { title: "Admin dashboard", icon: Shield, section: "Doctors", name: "Dr. Alex Morgan", detail: "General medicine · Sample account" },
};

export default function MockDashboard() {
  const { role } = useParams();
  const navigate = useNavigate();
  if (!isMockRole(role)) return <Navigate to="/auth" replace />;
  const view = views[role];
  const Icon = view.icon;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
          <h1 className="text-2xl font-bold text-primary">DocNow</h1>
          <Button variant="outline" onClick={() => navigate(role === "patient" ? "/auth?as=patient" : "/auth", { replace: true })}>
            <LogOut className="mr-2 h-4 w-4" />Log out
          </Button>
        </div>
      </header>
      <main className="container mx-auto space-y-8 px-4 py-8">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">{view.title}</h2>
            <p className="text-sm text-muted-foreground">Demo account · Sample data only</p>
          </div>
        </div>
        <section className="space-y-4">
          <h3 className="text-lg font-semibold">{view.section}</h3>
          <article className="flex max-w-xl items-center gap-4 rounded-lg border bg-card p-5">
            <CalendarDays className="h-6 w-6 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold">{view.name}</p>
              <p className="text-sm text-muted-foreground">{view.detail}</p>
            </div>
            {role !== "admin" && (
              <Button className="ml-auto" onClick={() => navigate(`/demo/call?as=${role}`)}>
                <Video className="mr-2 h-4 w-4" />{role === "doctor" ? "Start call" : "Join call"}
              </Button>
            )}
          </article>
        </section>
        <Button variant="ghost" onClick={() => navigate("/")}>Back to home</Button>
      </main>
    </div>
  );
}