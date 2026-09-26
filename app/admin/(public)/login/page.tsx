import { AdminLogin } from "@/app/admin/admin-login";
import { getSupabasePublicConfig } from "@/lib/admin/access";

export default function AdminLoginPage() {
  const config = getSupabasePublicConfig();
  return <AdminLogin config={config} />;
}
