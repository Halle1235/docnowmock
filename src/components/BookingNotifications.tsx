import { Bell, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { bookingSound, useBookingSound } from "@/lib/booking-sound";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { bookingNotifications, useBookingNotificationList, type NotificationRole } from "@/lib/booking-notifications";

export default function BookingNotifications({ role }: { role: NotificationRole }) {
  const items = useBookingNotificationList(role);
  const unread = items.filter(n => !n.read).length;
  const sound = useBookingSound(role);
  const enabled = sound[role];
  const toggle = async () => {
    if (enabled) { bookingSound.setEnabled(role, false); return; }
    if (!await bookingSound.activate()) { toast.error("Sound is unavailable. Booking alerts will still appear."); return; }
    bookingSound.setEnabled(role, true); bookingSound.play(role);
  };
  return <div className="flex items-center"><Button variant="ghost" size="icon" aria-label={enabled ? "Mute booking sounds" : "Enable booking sounds"} title={enabled ? "Mute booking sounds" : "Enable booking sounds"} aria-pressed={enabled} onClick={() => void toggle()}>{enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</Button><Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative shrink-0" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} title="Notifications"><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute end-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unread}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]"><div className="flex items-center justify-between gap-2 border-b pb-3"><h2 className="font-semibold">Notifications</h2><Button size="icon" variant="ghost" disabled={!unread} title="Mark all as read" aria-label="Mark all notifications as read" onClick={() => bookingNotifications.markRead(role)}><CheckCheck className="h-4 w-4" /></Button></div><ol className="max-h-80 overflow-y-auto">{items.map(item => <li key={item.id} className={`border-b py-3 text-sm ${item.read ? "text-muted-foreground" : "text-foreground"}`}><p className="break-words">{item.message}</p><time className="mt-1 block text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ol>{!items.length && <p className="py-5 text-sm text-muted-foreground">No notifications yet</p>}</PopoverContent></Popover></div>;
}