import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ago } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { markAllRead } from "./actions";

export const metadata = { title: "Notifications" };

/** Booking requests, quote replies and card payments, newest first. */
export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} new` : "You're all caught up."}
        actions={unread > 0 && <form action={markAllRead}><button className="btn-secondary">Mark all read</button></form>}
      />
      <Card>
        {items.length === 0 ? <Empty>Booking requests, quote replies and card payments will show up here.</Empty> : (
          <ul className="divide-y divide-gray-100">
            {items.map((n) => (
              <li key={n.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-600"}`} />
                {n.href ? <Link href={`/notifications/${n.id}`} className={`flex-1 link ${n.readAt ? "" : "font-medium"}`}>{n.title}</Link> : <span className={`flex-1 ${n.readAt ? "" : "font-medium"}`}>{n.title}</span>}
                <span className="text-xs text-gray-500">{ago(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
