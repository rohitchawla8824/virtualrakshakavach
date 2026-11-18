import type { RequestHandler } from 'express';
import { getReport, type ReportId } from './report.service.js';

function csvValue(value: unknown) {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export const reportController: RequestHandler = async (request, response) => {
  const data = await getReport(
    request.params.reportId as ReportId,
    {
      ...request.query,
      ...(request.query.format === 'csv' ? { page: 1, limit: 10_000 } : {}),
    } as never,
    request.auth!,
  );
  if (request.query.format === 'csv') {
    const body = data as { items?: unknown[]; summary?: unknown };
    const rows = body.items?.length ? body.items : body.summary ? [body.summary] : [];
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row as object)))];
    const csv = [
      columns.map(csvValue).join(','),
      ...rows.map((row) =>
        columns.map((column) => csvValue((row as Record<string, unknown>)[column])).join(','),
      ),
    ].join('\r\n');
    response
      .status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="vrk-${request.params.reportId}-${new Date().toISOString().slice(0, 10)}.csv"`,
      )
      .send(`\uFEFF${csv}`);
    return;
  }
  response.json(data);
};
