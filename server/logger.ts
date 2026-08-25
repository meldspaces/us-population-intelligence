export function serverLog(
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
): void {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...extra,
  });
  if (level === "error") {
    console.error(payload);
    return;
  }
  process.stdout.write(`${payload}\n`);
}
