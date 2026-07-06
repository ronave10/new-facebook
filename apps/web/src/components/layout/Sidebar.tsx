"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-store";

const NAV = [
  { href: "/dashboard", label: "לוח בקרה", icon: "grid" },
  { href: "/clients", label: "לקוחות", icon: "users" },
  { href: "/campaigns", label: "קמפיינים", icon: "megaphone" },
  { href: "/approvals", label: "אישורים", icon: "check" },
  { href: "/analytics", label: "אנליטיקס", icon: "chart" },
  { href: "/recommendations", label: "המלצות", icon: "bulb" },
  { href: "/activity", label: "פעילות", icon: "activity" },
  { href: "/settings", label: "הגדרות", icon: "cog" },
];

function Icon({ name }: { name: string }) {
  const common = "h-5 w-5";
  switch (name) {
    case "grid":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
    case "users":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 6a3 3 0 010 6M21 20c0-2-1-3.5-3-4.5" /></svg>;
    case "megaphone":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1z" /><path d="M16 8a5 5 0 010 8" /></svg>;
    case "check":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M9 12l2 2 4-4" /><rect x="3" y="4" width="18" height="16" rx="2" /></svg>;
    case "chart":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case "bulb":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M9 18h6M10 21h4M12 3a6 6 0 013 11v2H9v-2a6 6 0 013-11z" /></svg>;
    case "activity":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M22 12h-4l-3 8-4-16-3 8H2" /></svg>;
    case "cog":
      return <svg className={common} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></svg>;
    default:
      return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const { session, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col bg-slate-900 text-slate-300">
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">CO</div>
        <div>
          <div className="text-sm font-bold text-white">CampaignOS AI</div>
          <div className="text-xs text-slate-400">{session?.organizationName}</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-600/20 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3">
        <div className="flex items-center justify-between rounded-xl px-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-white">{session?.user.name}</div>
            <div className="truncate text-xs text-slate-400">{session?.user.email}</div>
          </div>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-white" title="התנתקות">
            יציאה
          </button>
        </div>
      </div>
    </aside>
  );
}
