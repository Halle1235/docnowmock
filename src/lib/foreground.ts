export function onForeground(refresh: () => void) {
  const handleResume = () => {
    if (document.visibilityState === "visible") refresh();
  };
  document.addEventListener("visibilitychange", handleResume);
  window.addEventListener("pageshow", handleResume);
  window.addEventListener("focus", handleResume);
  return () => {
    document.removeEventListener("visibilitychange", handleResume);
    window.removeEventListener("pageshow", handleResume);
    window.removeEventListener("focus", handleResume);
  };
}
