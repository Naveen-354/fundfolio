import Link from "next/link";
import { connection } from "next/server";
import { AdminSignOut } from "@/app/admin/admin-sign-out";
import { AdminNavigation, AdminTopbar } from "@/app/admin/admin-navigation";
import { AdminMfaSetup } from "@/app/admin/admin-mfa-setup";
import { requireAdmin } from "@/lib/admin/access";

export default async function SecureAdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  const access = await requireAdmin();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand admin-brand" href="/admin">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-copy"><strong>Fundfolio</strong><small>ADMIN CONSOLE</small></span>
        </Link>
        <div className="admin-workspace-label">WORKSPACE</div>
        <AdminNavigation />
        <div className="admin-sidebar-foot" aria-label="Administrator profile and sign out">
          <div className="admin-user-avatar">{access.email.slice(0, 1).toUpperCase()}</div>
          <div className="admin-user-copy"><strong>{access.email}</strong><small>Administrator · MFA {access.mfaEnabled ? "active" : "recommended"}</small></div>
          <AdminSignOut />
        </div>
      </aside>
      <main className="admin-main">
        <AdminTopbar />
        <AdminMfaSetup initialEnabled={access.mfaEnabled} />
        {children}
      </main>
    </div>
  );
}
