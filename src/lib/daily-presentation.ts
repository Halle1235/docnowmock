/** Daily requires hex values; these adapter tokens remain owned by global CSS. */
export const dailyStartOptions = { startAudioOff: true } as const;

export function dailyPresentation(readToken: (name: string) => string) {
  const read = (name: string) => readToken(name).trim();
  return {
    ...dailyStartOptions,
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