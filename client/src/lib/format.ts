export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatPct(value: unknown, digits = 1): string {
  const n = asNumber(value);
  return n === null ? "—" : `${n.toFixed(digits)}%`;
}

export function formatPop(value: unknown): string {
  const n = asNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US");
}

export function labelize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
