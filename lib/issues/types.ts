export const issueReportStatuses = ["open", "in_progress", "resolved"] as const;

export type IssueReportStatus = (typeof issueReportStatuses)[number];

export type IssueReport = {
  id: string;
  createdAt: string;
  updatedAt: string;
  reporterName: string | null;
  reporterEmail: string | null;
  message: string;
  pagePath: string | null;
  status: IssueReportStatus;
  resolutionNote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type IssueReportCounts = Record<IssueReportStatus, number>;
