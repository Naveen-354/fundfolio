"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey);
}

export function createSupabaseInviteClient(url: string, anonKey: string) {
  return createBrowserClient(url, anonKey, {
    isSingleton: false,
    auth: { detectSessionInUrl: false },
  });
}
