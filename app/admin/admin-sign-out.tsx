"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AdminSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && anonKey ? createSupabaseBrowserClient(url, anonKey) : null;
  }, []);

  async function signOut() {
    if (!supabase || pending) return;
    setPending(true);
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return <button className="admin-logout" type="button" aria-label="Sign out" onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</button>;
}
