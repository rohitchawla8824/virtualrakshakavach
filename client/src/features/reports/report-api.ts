import { authenticatedApiDownload, authenticatedApiRequest } from '@/features/auth/auth-api';

export type ReportId =
  | 'collections'
  | 'outstanding'
  | 'overdue-invoices'
  | 'product-sales'
  | 'subscriptions'
  | 'employee-performance'
  | 'refunds'
  | 'notification-delivery';
export type ReportFilters = {
  from: string;
  to: string;
  period?: 'daily' | 'weekly' | 'monthly';
  status?: 'ACTIVE' | 'EXPIRED' | 'UPCOMING';
  page?: number;
  limit?: number;
};
export type ReportPayload = {
  items: Array<Record<string, unknown>>;
  summary?: Record<string, unknown> | Array<Record<string, unknown>>;
  pagination?: { page: number; limit: number; total: number; pages: number };
  note?: string;
};
function pathFor(report: ReportId, filters: ReportFilters, format = 'json') {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, format })) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return `/reports/${report}?${query.toString()}`;
}
export const fetchReport = (report: ReportId, filters: ReportFilters) =>
  authenticatedApiRequest<ReportPayload>(pathFor(report, filters));
export async function downloadReportCsv(report: ReportId, filters: ReportFilters) {
  const blob = await authenticatedApiDownload(pathFor(report, filters, 'csv'));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `vrk-${report}-${filters.from}-${filters.to}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
