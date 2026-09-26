import type { Metadata } from "next";
import { IssueReportManager } from "@/app/admin/issues/issue-report-manager";
import { requireAdmin } from "@/lib/admin/access";
import { listIssueReports } from "@/lib/issues/repository";

export const metadata: Metadata = { title: "Problem reports" };

export default async function IssueReportsPage() {
  await requireAdmin();
  let initialData: Awaited<ReturnType<typeof listIssueReports>> | null = null;
  try {
    initialData = await listIssueReports({ status: "open", search: "", limit: 40, offset: 0 });
  } catch {
    initialData = null;
  }

  if (!initialData) return <IssueReportManager initialError="Problem reports could not be loaded. Check the database connection and try again." />;
  return <IssueReportManager initialData={{ ...initialData, page: 1, pageSize: 40, pageCount: Math.max(1, Math.ceil(initialData.total / 40)) }} />;
}
