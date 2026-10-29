"use client";

/** Opens the browser's print dialog, where the client can also choose "Save as PDF". */
export function PrintButton({ label = "Download PDF / print" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-secondary btn-sm">{label}</button>;
}
