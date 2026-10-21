const EIGHTHS = ["", "⅛", "¼", "⅜", "½", "⅝", "¾", "⅞"];

/** 54 -> "2⅛": millimetres to the nearest eighth of an inch. */
export function inches(mm: number): string {
  const e = Math.round((mm / 25.4) * 8);
  const whole = Math.floor(e / 8);
  const frac = EIGHTHS[e % 8];
  return whole ? `${whole}${frac}` : frac || "0";
}

export const mmLabel = (mm: number) => (Number.isInteger(mm) ? `${mm}` : mm.toFixed(1));
