import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ShieldCheck, UserCog, BadgeCheck, UserPlus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { MOCK_LOGIN_ENABLED } from "@/lib/mock-login";

type AppRole = "patient" | "doctor" | "admin";
const ALL_ROLES: AppRole[] = ["patient", "doctor", "admin"];
const emptyDoctor = { full_name: "", email: "", password: "", license_number: "", specialization: "" };

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
}

interface DoctorProfile {
  id: string;
  user_id: string;
  license_number: string;
  specialization: string;
  is_verified: boolean;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<{ user_id: string; role: AppRole }[]>([]);
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  const [newDoctor, setNewDoctor] = useState(emptyDoctor);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const verifyAdmin = async () => {
      if (MOCK_LOGIN_ENABLED) {
        // Demo: sample data only, nothing is read from or written to real records.
        setProfiles([
          { id: "s-doc", full_name: "Dr. Alex Morgan", email: "alex.morgan@example.com", phone: null },
          { id: "s-pat", full_name: "Sample patient", email: "patient@example.com", phone: "+971 50 000 0000" },
        ]);
        setRoles([{ user_id: "s-doc", role: "doctor" }, { user_id: "s-pat", role: "patient" }]);
        setDoctorProfiles([{ id: "s-dp", user_id: "s-doc", license_number: "DHA-00000", specialization: "General medicine", is_verified: true }]);
        setChecking(false);
        setLoading(false);
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        navigate("/auth");
        return;
      }
      setCurrentUserId(user.id);

      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      if (!adminRole) {
        toast({
          title: "Access denied",
          description: "This area is restricted to administrators.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setChecking(false);
      loadData();
    };

    verifyAdmin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, doctorsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, phone").order("full_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase
        .from("doctor_profiles")
        .select("id, user_id, license_number, specialization, is_verified"),
    ]);

    if (profilesRes.error || rolesRes.error) {
      toast({
        title: "Could not load users",
        description: profilesRes.error?.message || rolesRes.error?.message,
        variant: "destructive",
      });
    }

    setProfiles(profilesRes.data ?? []);
    setRoles((rolesRes.data as { user_id: string; role: AppRole }[]) ?? []);
    setDoctorProfiles(doctorsRes.data ?? []);
    setLoading(false);
  };

  const rolesFor = (userId: string) => roles.filter((r) => r.user_id === userId).map((r) => r.role);

  const toggleRole = async (userId: string, role: AppRole, hasRole: boolean) => {
    const key = `${userId}-${role}`;
    if (MOCK_LOGIN_ENABLED) {
      setRoles((rs) => hasRole ? rs.filter((r) => !(r.user_id === userId && r.role === role)) : [...rs, { user_id: userId, role }]);
      return;
    }
    setBusyKey(key);

    const { error } = hasRole
      ? await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role)
      : await supabase.from("user_roles").insert({ user_id: userId, role });

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: hasRole ? "Role removed" : "Role granted",
        description: `${role} ${hasRole ? "revoked from" : "granted to"} the user.`,
      });
      await loadData();
    }
    setBusyKey(null);
  };

  const toggleVerification = async (doctor: DoctorProfile) => {
    const key = `verify-${doctor.id}`;
    setBusyKey(key);

    const { error } = await supabase
      .from("doctor_profiles")
      .update({ is_verified: !doctor.is_verified })
      .eq("id", doctor.id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: doctor.is_verified ? "Verification removed" : "Doctor verified",
        description: doctor.is_verified
          ? "The doctor no longer has dashboard access."
          : "The doctor role was granted automatically.",
      });
      await loadData();
    }
    setBusyKey(null);
  };

  const createDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (MOCK_LOGIN_ENABLED) {
      // Demo: new doctors are approved automatically and kept only on this screen.
      const id = `s-${Date.now()}`;
      setProfiles((ps) => [...ps, { id, full_name: newDoctor.full_name, email: newDoctor.email, phone: null }]);
      setRoles((rs) => [...rs, { user_id: id, role: "doctor" }]);
      setDoctorProfiles((ds) => [...ds, { id: `${id}-dp`, user_id: id, license_number: newDoctor.license_number, specialization: newDoctor.specialization, is_verified: true }]);
      toast({ title: "Doctor added (demo)", description: "Approved automatically. Sample only, no real account was created." });
      setNewDoctor(emptyDoctor);
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-doctor", { body: newDoctor });
    setCreating(false);
    const msg = error ? (await (error as any).context?.json?.().catch(() => null))?.error ?? error.message : data?.error;
    if (error || data?.error) {
      toast({
        title: "Could not create doctor",
        description: typeof msg === "string" ? msg : "Please check the details and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Doctor account created", description: `${newDoctor.email} can now log in.` });
    setNewDoctor(emptyDoctor);
    await loadData();
  };

  const filtered = profiles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">DocNow Admin</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/")}>
            Back to site
          </Button>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-4 w-4 text-primary" />
              Users & roles
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : (
              filtered.map((profile) => {
                const userRoles = rolesFor(profile.id);
                const isSelf = profile.id === currentUserId;
                return (
                  <div
                    key={profile.id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{profile.full_name || "Unnamed user"}</p>
                      <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {userRoles.length === 0 ? (
                          <Badge variant="outline">no roles</Badge>
                        ) : (
                          userRoles.map((role) => (
                            <Badge key={role} variant="secondary">
                              {role}
                            </Badge>
                          ))
                        )}
                        {isSelf && <Badge variant="outline">you</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {ALL_ROLES.map((role) => {
                        const hasRole = userRoles.includes(role);
                        const key = `${profile.id}-${role}`;
                        return (
                          <Button
                            key={role}
                            size="sm"
                            variant={hasRole ? "secondary" : "outline"}
                            disabled={isSelf || busyKey === key}
                            onClick={() => toggleRole(profile.id, role, hasRole)}
                          >
                            {busyKey === key && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            {hasRole ? `Remove ${role}` : `Grant ${role}`}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
            {!loading && (
              <p className="pt-2 text-xs text-muted-foreground">
                You cannot change your own roles. Ask another administrator if needed.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-primary" />
              Add a doctor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={createDoctor} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="d-name">Full name</Label>
                <Input id="d-name" required value={newDoctor.full_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-email">Email</Label>
                <Input id="d-email" type="email" required value={newDoctor.email}
                  onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-license">DHA licence number</Label>
                <Input id="d-license" required value={newDoctor.license_number}
                  onChange={(e) => setNewDoctor({ ...newDoctor, license_number: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-spec">Specialisation</Label>
                <Input id="d-spec" required value={newDoctor.specialization}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialization: e.target.value })} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="d-pass">Temporary password</Label>
                <Input id="d-pass" type="text" required minLength={10} value={newDoctor.password}
                  onChange={(e) => setNewDoctor({ ...newDoctor, password: e.target.value })} />
                <p className="text-xs text-muted-foreground">
                  At least 10 characters. Share it with the doctor securely; they can change it with "Forgot password?".
                </p>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Create doctor account
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BadgeCheck className="h-4 w-4 text-primary" />
              Doctor verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {doctorProfiles.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No doctor applications yet.
              </p>
            ) : (
              doctorProfiles.map((doctor) => {
                const profile = profiles.find((p) => p.id === doctor.user_id);
                const key = `verify-${doctor.id}`;
                return (
                  <div
                    key={doctor.id}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {profile?.full_name || doctor.user_id}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {doctor.specialization} · License {doctor.license_number}
                      </p>
                      <Badge
                        className="mt-2"
                        variant={doctor.is_verified ? "secondary" : "outline"}
                      >
                        {doctor.is_verified ? "verified" : "pending"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={doctor.is_verified ? "outline" : "default"}
                      disabled={busyKey === key}
                      onClick={() => toggleVerification(doctor)}
                    >
                      {busyKey === key && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {doctor.is_verified ? "Revoke verification" : "Verify doctor"}
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminDashboard;
