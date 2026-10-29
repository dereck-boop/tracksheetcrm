/** Kinds of studio event. "Closed" days block online booking requests by default. */
export const EVENT_KINDS = [
  { kind: "Release", color: "#7c3aed", hint: "Release date for a single, EP or album" },
  { kind: "Showcase", color: "#db2777", hint: "Showcase, listening party, open house, gig" },
  { kind: "Meeting", color: "#0369a1", hint: "Client meeting, consult, call" },
  { kind: "Workshop", color: "#ca8a04", hint: "Class, clinic, masterclass" },
  { kind: "Maintenance", color: "#57534e", hint: "Tech day, install, repairs" },
  { kind: "Closed", color: "#b91c1c", hint: "Holiday, vacation, studio closed" },
  { kind: "Other", color: "#475569", hint: "" },
] as const;

export const eventColor = (kind: string) => EVENT_KINDS.find((k) => k.kind === kind)?.color ?? "#475569";
