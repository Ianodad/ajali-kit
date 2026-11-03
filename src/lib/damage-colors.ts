// One distinct colour per damage item on the canvas overlay (S11: "coloured
// semi-transparent masks, one colour per item"). Cycles if there are more
// items than colours (Muse Spark returns at most 12).
const PALETTE = ["#ef4444", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function colorForItemIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
