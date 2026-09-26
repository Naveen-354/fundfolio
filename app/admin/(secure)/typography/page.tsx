import type { Metadata } from "next";
import { TypographyEditor } from "@/app/admin/typography/typography-editor";

export const metadata: Metadata = { title: "Typography" };

export default function TypographyPage() {
  return <TypographyEditor />;
}
