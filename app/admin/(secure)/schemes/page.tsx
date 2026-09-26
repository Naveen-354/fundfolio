import type { Metadata } from "next";
import { SchemeManager } from "@/app/admin/schemes/scheme-manager";

export const metadata: Metadata = { title: "Schemes" };

export default function SchemesPage() {
  return <SchemeManager />;
}
