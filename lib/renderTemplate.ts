/** Fills {{placeholders}} in an email template. Safe to use in the browser. */
export function render(tpl: string, vars: Record<string, string | null | undefined>) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? "").replace(/\n{3,}/g, "\n\n");
}
