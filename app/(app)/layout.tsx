import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  // Dark unless this device picked light; read on the server so the page never flashes the other theme.
  const theme: Theme = (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  return (
    <div id="qh-app" className="qh-app min-h-screen" data-theme={theme}>
      <Sidebar studio={user.studio.name} logo={user.studio.logoUrl} user={{ name: user.name, role: user.role }} unread={unread} theme={theme} />
      <main className="lg:pl-[248px] print:pl-0">
        <div className="mx-auto max-w-[1220px] px-4 py-6 sm:px-10 sm:py-9">{children}</div>
      </main>
    </div>
  );
}
