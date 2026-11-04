/** Daily requires hex values; these adapter tokens remain owned by global CSS. */
export function dailyPresentation(readToken: (name: string) => string) {
  const read = (name: string) => readToken(name).trim();
  return {
    startAudioOff: true,
    theme: { colors: {
      accent: read("--daily-accent"),
      accentText: read("--daily-foreground"),
      background: read("--daily-background"),
      baseText: read("--daily-foreground"),
      border: read("--daily-border"),
      mainAreaBg: read("--daily-background"),
    } },
  };
}