import { useEffect, useSyncExternalStore } from "react";
import type { NotificationRole } from "./booking-notifications";

export function createBookingSound(createContext: () => AudioContext) {
  let context: AudioContext | null = null;
  let state = { doctor: true, patient: true, ready: false };
  const active = { doctor: 0, patient: 0 };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const play = (role: NotificationRole) => {
    if (!state[role] || !active[role] || context?.state !== "running") return false;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = role === "doctor" ? 660 : 880;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    return true;
  };
  return {
    getSnapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    mount(role: NotificationRole) { active[role]++; return () => { active[role]--; }; },
    async activate() {
      try {
        context ??= createContext();
        await context.resume();
        state = { ...state, ready: context.state === "running" }; emit();
        return state.ready;
      } catch { state = { ...state, ready: false }; emit(); return false; }
    },
    setEnabled(role: NotificationRole, enabled: boolean) { state = { ...state, [role]: enabled }; emit(); },
    play,
  };
}
export const bookingSound = createBookingSound(() => new AudioContext());
export function useBookingSound(role: NotificationRole) {
  const state = useSyncExternalStore(bookingSound.subscribe, bookingSound.getSnapshot, bookingSound.getSnapshot);
  useEffect(() => {
    const unmount = bookingSound.mount(role);
    const activate = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[aria-label="Enable booking sounds"], [aria-label="Mute booking sounds"]')) return;
      void bookingSound.activate();
      window.removeEventListener("pointerdown", activate); window.removeEventListener("keydown", activate);
    };
    window.addEventListener("pointerdown", activate);
    window.addEventListener("keydown", activate);
    return () => { unmount(); window.removeEventListener("pointerdown", activate); window.removeEventListener("keydown", activate); };
  }, [role]);
  return state;
}