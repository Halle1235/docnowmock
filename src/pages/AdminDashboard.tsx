import { useAccount } from "@/components/AccountProvider";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ShieldCheck, UserCog, BadgeCheck, UserPlus, LogOut, Pencil, Save } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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
  cleanup_pending: boolean;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { user } = useAccount();
  const currentUserId = user?.id;
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<{ user_id: string; role: AppRole }[]>([]);
  const [doctorProfiles, setDoctorProfiles] = useState<DoctorProfile[]>([]);
  const [cleanupWithoutProfile, setCleanupWithoutProfile] = useState<{ doctor_id: string; name: string | null }[]>([]);
  const [newDoctor, setNewDoctor] = useState(emptyDoctor);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      navigate("/auth", { replace: true });
    } catch {
      toast({ title: "Could not log out", description: "Please try again.", variant: "destructive" });
    } finally {
      setSigningOut(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || !editing.full_name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_edit_profile", {
        _user_id: editing.id, _full_name: editing.full_name, _phone: editing.phone,
      });
      if (error) throw error;
      await loadData();
      setEditing(null);
      toast({ title: "Profile updated" });
    } catch (error) {
      toast({
        title: "Could not save profile",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_directory");
      if (error || !data) throw new Error("Your access or connection could not be verified.");
      const directory = data as unknown as {
        profiles: Profile[];
        roles: { user_id: string; role: AppRole }[];
        doctors: DoctorProfile[];
        cleanup_without_profile: { doctor_id: string; name: string | null }[];
      };
      setProfiles(directory.profiles);
      setRoles(directory.roles);
      setDoctorProfiles(directory.doctors);
      setCleanupWithoutProfile(directory.cleanup_without_profile);
    } catch (error) {
      toast({
        title: "Could not load users",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProfiles([]);
    setRoles([]);
    setDoctorProfiles([]);
    setCleanupWithoutProfile([]);
    if (currentUserId) void loadData();
    // The account boundary unmounts the portal when access changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const rolesFor = (userId: string) => roles.filter((r) => r.user_id === userId).map((r) => r.role);

  const closeDoctorRooms = async (doctorId: string) => {
    const { data, error } = await supabase.functions.invoke("revoke-call-access", { body: { doctorId } });
    if (error || data?.pending !== false) {
      toast({
        title: "Video room cleanup pending",
        description: "Retry closing the affected rooms from Doctor verification.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Video room cleanup confirmed" });
  };

  const updateDoctorAccess = async (doctorId: string, enabled: boolean, key: string) => {
    setBusyKey(key);
    try {
      const { error } = await supabase.rpc("admin_set_doctor_access", { _user_id: doctorId, _enabled: enabled });
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: enabled ? "Doctor verified" : "Doctor access removed" });
      if (!enabled) await closeDoctorRooms(doctorId);
      await loadData();
    } finally {
      setBusyKey(null);
    }
  };

  const toggleRole = async (userId: string, role: AppRole, hasRole: boolean) => {
    const key = `${userId}-${role}`;
    if (role === "doctor") {
      await updateDoctorAccess(userId, !hasRole, key);
      return;
    }
    setBusyKey(key);
    try {
      const { error } = await supabase.rpc("admin_set_basic_role", { _user_id: userId, _role: role, _enabled: !hasRole });
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: hasRole ? "Role removed" : "Role granted" });
      await loadData();
    } finally {
      setBusyKey(null);
    }
  };

  const retryRoomCleanup = async (doctorId: string) => {
    setBusyKey(`cleanup-${doctorId}`);
    try {
      await closeDoctorRooms(doctorId);
      await loadData();
    } finally {
      setBusyKey(null);
    }
  };

  const createDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newDoctor.email.trim().toLowerCase();
    const existing = profiles.find((profile) => profile.email.toLowerCase() === email);
    if (existing) {
      const doctor = doctorProfiles.find((profile) => profile.user_id === existing.id);
      toast({
        title: "Account already exists",
        description: doctor
          ? doctor.is_verified
            ? "This doctor is already verified. Use their existing sign-in details."
            : "Review this account under Doctor verification below to approve the application."
          : "The account holder must sign in and submit a doctor application before you can approve it.",
      });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-doctor", {
        body: { ...newDoctor, email },
      });
      let payload = data;
      if (error && "context" in error && error.context instanceof Response) {
        payload = await error.context.json().catch(() => null);
      }
      if (error || payload?.error) {
        toast({
          title: payload?.code === "EMAIL_ALREADY_REGISTERED" ? "Account already exists" : "Could not create doctor",
          description:
            typeof payload?.error === "string"
              ? payload.error
              : (error?.message ?? "Please check the details and try again."),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Doctor account created", description: `${email} can now log in.` });
      setNewDoctor(emptyDoctor);
      await loadData();
    } catch {
      toast({
        title: "Could not create doctor",
        description: "The account service could not be reached. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const filtered = profiles.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return p.full_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">DocNow Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Back to site
            </Button>
            <Button variant="outline" size="sm" disabled={signingOut} onClick={() => void signOut()}>
              {signingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-8">
        {cleanupWithoutProfile.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Video room cleanup</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {cleanupWithoutProfile.map(({ doctor_id, name }) => (
                <div key={doctor_id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{name || "Former doctor"}</span>
                  <Button variant="outline" disabled={busyKey !== null}
                    onClick={() => void retryRoomCleanup(doctor_id)}>Retry video room cleanup</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
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
                      {profile.phone && <p className="text-sm text-muted-foreground">{profile.phone}</p>}
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
                      <Button size="sm" variant="outline" onClick={() => setEditing({ ...profile })}>
                        <Pencil className="mr-2 h-3 w-3" />
                        Edit profile
                      </Button>
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
                            {busyKey === key && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                            {hasRole ? `Remove ${role}` : role === "doctor" ? "Approve doctor" : `Grant ${role}`}
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
                <Input
                  id="d-name"
                  required
                  value={newDoctor.full_name}
                  onChange={(e) => setNewDoctor({ ...newDoctor, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-email">Email</Label>
                <Input
                  id="d-email"
                  type="email"
                  required
                  value={newDoctor.email}
                  onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-license">DHA licence number</Label>
                <Input
                  id="d-license"
                  required
                  value={newDoctor.license_number}
                  onChange={(e) => setNewDoctor({ ...newDoctor, license_number: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="d-spec">Specialisation</Label>
                <Input
                  id="d-spec"
                  required
                  value={newDoctor.specialization}
                  onChange={(e) => setNewDoctor({ ...newDoctor, specialization: e.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="d-pass">Temporary password</Label>
                <Input
                  id="d-pass"
                  type="password"
                  required
                  minLength={10}
                  value={newDoctor.password}
                  onChange={(e) => setNewDoctor({ ...newDoctor, password: e.target.value })}
                />
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
              <p className="py-6 text-center text-sm text-muted-foreground">No doctor applications yet.</p>
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
                      <p className="truncate font-medium">{profile?.full_name || doctor.user_id}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {doctor.specialization} · License {doctor.license_number}
                      </p>
                      <Badge className="mt-2" variant={doctor.is_verified ? "secondary" : "outline"}>
                        {doctor.is_verified ? "verified" : "pending"}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant={doctor.is_verified ? "outline" : "default"}
                      disabled={busyKey === key}
                      onClick={() => void updateDoctorAccess(doctor.user_id, !doctor.is_verified, `verify-${doctor.id}`)}
                    >
                      {busyKey === key && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      {doctor.is_verified ? "Revoke verification" : "Verify doctor"}
                    </Button>
                    {doctor.cleanup_pending && (
                      <Button variant="outline" disabled={busyKey !== null}
                        onClick={() => void retryRoomCleanup(doctor.user_id)}>
                        Retry video room cleanup
                      </Button>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Full name</Label>
                <Input
                  id="edit-name"
                  required
                  maxLength={120}
                  disabled={saving}
                  value={editing.full_name}
                  onChange={(event) => setEditing({ ...editing, full_name: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  maxLength={32}
                  disabled={saving}
                  value={editing.phone ?? ""}
                  onChange={(event) => setEditing({ ...editing, phone: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Account email</Label>
                <Input id="edit-email" type="email" value={editing.email} disabled />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !editing.full_name.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
                  changes
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
