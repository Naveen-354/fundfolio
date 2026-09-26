import { AdminSetPassword } from "@/app/admin/admin-set-password";
import { getSupabasePublicConfig } from "@/lib/admin/access";

export default function AdminSetPasswordPage() {
  return <AdminSetPassword config={getSupabasePublicConfig()} />;
}
