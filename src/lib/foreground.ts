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

/** Poll only while the current page is visible, then refresh as soon as it resumes. */
export function onVisibleInterval(refresh: () => void, intervalMs: number) {
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") refresh();
  }, intervalMs);
  const unsubscribe = onForeground(refresh);
  return () => {
    window.clearInterval(timer);
    unsubscribe();
  };
}
