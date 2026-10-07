export function cn(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}
export function safeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const origin = globalThis.location?.origin ?? "http://localhost";
    if (value.startsWith("//") || value.startsWith("\\\\")) return undefined;
    const explicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
    const url = new URL(value, origin);
    if (explicitScheme)
      return ["https:", "http:", "mailto:"].includes(url.protocol) ? value : undefined;
    if (url.origin !== origin) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}
export function errorDetail(value: string) {
  return safeDiagnosticText(value).split("\n")[0]?.slice(0, 240);
}
export function safeDiagnosticText(value: string) {
  return /(?:bearer\s|api[_ -]?key|authorization|\bat\s+\S+\s*\(|stack trace|sk-[\w-]{8})/i.test(
    value,
  )
    ? "This operation could not be completed."
    : value;
}
export function formatJson(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
