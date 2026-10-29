import { db } from "./db";
import { emailBackup } from "./backup";
import { inTz } from "./format";
import { fillStripeFees } from "./stripeFees";

/**
 * The business-admin part of the daily job. Each step is independent and never throws, so one
 * failure can't stop the rest of the morning run.
 */
export async function adminJobs(today: Date) {
  const out: Record<string, number> = {};
  const step = async (name: string, fn: () => Promise<number>) => {
    try { out[name] = await fn(); } catch (e) { console.error(`daily job ${name} failed`, e); out[name] = -1; }
  };
  await step("backupsEmailed", () => weeklyBackups(today));
  await step("cardFeesFilled", () => fillStripeFees());
  return out;
}

/** Mondays (and the first run ever): email the studio's owners a backup. */
async function weeklyBackups(today: Date) {
  const monday = inTz(today).getDay() === 1;
  const studios = await db.studio.findMany({ where: { backupWeekly: true }, select: { id: true, lastBackupAt: true } });
  let n = 0;
  for (const s of studios) {
    const due = !s.lastBackupAt || (monday && Date.now() - s.lastBackupAt.getTime() > 5 * 864e5);
    if (due && (await emailBackup(s.id)).sent) n++;
  }
  return n;
}
