import { EMAIL_TEMPLATES, TEMPLATE_KEYS } from "./emailTemplates";
export const DEFAULT_BOOKING_TYPES = [
  { name: "Tracking", color: "#2f7d6d", sortOrder: 0 },
  { name: "Mixing", color: "#3b82f6", sortOrder: 1 },
  { name: "Mastering", color: "#8b5cf6", sortOrder: 2 },
  { name: "Podcast", color: "#f59e0b", sortOrder: 3 },
  { name: "Rehearsal", color: "#ef4444", sortOrder: 4 },
  { name: "Maintenance", color: "#6b7280", sortOrder: 5 },
];

export const DEFAULT_EMAIL_TEMPLATES = TEMPLATE_KEYS.map((key) => ({ key, subject: EMAIL_TEMPLATES[key].subject, body: EMAIL_TEMPLATES[key].body }));
