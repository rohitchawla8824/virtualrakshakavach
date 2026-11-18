import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Download, RefreshCw, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { downloadReportCsv, fetchReport, type ReportFilters, type ReportId } from './report-api';

const choices: Array<{ id: ReportId; title: string; description: string }> = [
  {
    id: 'collections',
    title: 'Collections',
    description: 'Daily, weekly, and monthly successful payment totals.',
  },
  {
    id: 'outstanding',
    title: 'Outstanding',
    description: 'Current balances after allocations and processed refunds.',
  },
  {
    id: 'overdue-invoices',
    title: 'Overdue invoices',
    description: 'Open invoices past their due date.',
  },
  {
    id: 'product-sales',
    title: 'Product sales',
    description: 'Sales and quantities from immutable invoice line items.',
  },
  {
    id: 'subscriptions',
    title: 'Subscriptions',
    description: 'Active, expired, and upcoming renewals.',
  },
  {
    id: 'employee-performance',
    title: 'Employee collections',
    description: 'Successful manual collections by employee.',
  },
  { id: 'refunds', title: 'Refunds', description: 'Refund requests and processed refund totals.' },
  {
    id: 'notification-delivery',
    title: 'Notification delivery',
    description: 'Queued, sent, failed, and read delivery status.',
  },
];
const indiaDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
};
const initialTo = indiaDate(new Date());
const initialFrom = indiaDate(new Date(Date.now() - 29 * 86_400_000));
const money = (paise: unknown) => {
  try {
    const value = BigInt(String(paise ?? '0'));
    const prefix = value < 0n ? '-' : '';
    const absolute = value < 0n ? -value : value;
    return `₹${prefix}${new Intl.NumberFormat('en-IN').format(absolute / 100n)}.${String(absolute % 100n).padStart(2, '0')}`;
  } catch {
    return '—';
  }
};
const dateText = (value: unknown) => {
  if (typeof value !== 'string') return String(value ?? '—');
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        parsed,
      );
};
function cell(value: unknown, key: string) {
  if (key.toLowerCase().endsWith('paise') || key === 'amountPaise' || key === 'totalPaise')
    return money(value);
  if (key.toLowerCase().endsWith('at') && typeof value === 'string') return dateText(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.displayName ?? record.name ?? record.invoiceNumber ?? '—');
  }
  return String(value ?? '—');
}
function BarChart({
  rows,
  selected,
}: {
  rows: Array<Record<string, unknown>>;
  selected: ReportId;
}) {
  const data = rows.slice(0, 14).map((row) => ({
    label: String(row.date ?? row.product ?? '—'),
    value: BigInt(String(row.amountPaise ?? row.salesPaise ?? '0')),
  }));
  const maximum = data.reduce((max, item) => (item.value > max ? item.value : max), 0n) || 1n;
  if (!data.length)
    return (
      <EmptyState
        title="No chart data"
        description="Matching activity will appear here when available."
      />
    );
  return (
    <div className="w-full overflow-x-auto" aria-label={`${selected} chart`}>
      <svg
        className="h-64 min-w-[650px] w-full"
        viewBox="0 0 900 270"
        role="img"
        aria-label={`${selected} amounts in Indian rupees`}
      >
        {[0, 1, 2, 3].map((index) => (
          <line
            key={index}
            x1="44"
            x2="890"
            y1={34 + index * 56}
            y2={34 + index * 56}
            stroke="#e5e7eb"
            strokeDasharray="4 5"
          />
        ))}
        {data.map((item, index) => {
          const x = 54 + index * (820 / data.length);
          const width = Math.min(38, 520 / data.length);
          const ratio = Number((item.value * 10_000n) / maximum) / 10_000;
          const height = Math.max(3, ratio * 184);
          return (
            <g key={`${item.label}-${index}`}>
              <rect
                x={x}
                y={226 - height}
                width={width}
                height={height}
                rx="6"
                fill={selected === 'collections' ? '#C8102E' : '#111111'}
              />
              <text x={x + width / 2} y="248" textAnchor="middle" fontSize="10" fill="#64748b">
                {item.label.slice(0, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function SummaryCards({
  summary,
}: {
  summary?: Record<string, unknown> | Array<Record<string, unknown>>;
}) {
  const values = Array.isArray(summary)
    ? summary.map((item) => [
        String(item.status ?? item.channel ?? 'Status'),
        item.amountPaise ? money(item.amountPaise) : String(item.count ?? '0'),
      ])
    : Object.entries(summary ?? {})
        .filter(([key]) => key !== 'currency')
        .map(([key, value]) => [
          key.replace(/([A-Z])/g, ' $1').replace('Paise', ''),
          key.toLowerCase().endsWith('paise') ? money(value) : String(value),
        ]);
  if (!values.length) return null;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
      {values.slice(0, 4).map(([label, value]) => (
        <Panel key={label} className="relative overflow-hidden p-5">
          <span className="absolute right-0 top-0 h-1 w-16 rounded-bl-full bg-[#C8102E]" />
          <p className="text-xs font-bold uppercase tracking-[.12em] text-slate-500">{label}</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
        </Panel>
      ))}
    </div>
  );
}
export function ReportsPage() {
  const [report, setReport] = useState<ReportId>('collections');
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [status, setStatus] = useState<'ACTIVE' | 'EXPIRED' | 'UPCOMING'>('ACTIVE');
  const [page, setPage] = useState(1);
  const { show } = useToasts();
  const filters: ReportFilters = { from, to, period, status, page, limit: 20 };
  const result = useQuery({
    queryKey: ['reports', report, filters],
    queryFn: () => fetchReport(report, filters),
    retry: false,
  });
  const data = result.data;
  const config = choices.find((choice) => choice.id === report)!;
  async function exportCsv() {
    try {
      await downloadReportCsv(report, filters);
      show('CSV report downloaded.', 'success');
    } catch (error) {
      show(error instanceof Error ? error.message : 'Report export failed.', 'error');
    }
  }
  const items = result.data?.items ?? [];
  const headers = items.length
    ? Object.keys(items[0]).filter(
        (key) => !['_id', 'id', 'deduplicationKey', 'message'].includes(key),
      )
    : [];
  const chartEnabled = report === 'collections' || report === 'product-sales';
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-7 lg:px-10">
      <Link
        to="/admin"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#C8102E]"
      >
        <ArrowLeft size={16} /> Admin overview
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-[#17181C] p-6 text-white shadow-sm sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-rose-300">
            Business intelligence
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">Reports & notifications</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Review collections, balances, renewals and delivery activity using live records. Dates
            follow India Standard Time.
          </p>
        </div>
        <Button onClick={() => void exportCsv()} disabled={result.isLoading}>
          <Download size={16} /> Export CSV
        </Button>
      </header>
      <Panel className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Build a report</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choose a report and date range, then refresh the results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  const end = indiaDate(new Date());
                  const start = indiaDate(new Date(Date.now() - (days - 1) * 86_400_000));
                  setFrom(start);
                  setTo(end);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#C8102E] hover:text-[#C8102E]"
              >
                Last {days} days
              </button>
            ))}
          </div>
        </div>{' '}
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(150px,.6fr))_auto] lg:items-end">
          <label className="text-sm font-medium">
            Report
            <select
              className="field mt-1 w-full rounded-xl border p-2.5"
              value={report}
              onChange={(event) => {
                setReport(event.target.value as ReportId);
                setPage(1);
              }}
            >
              {choices.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            From
            <input
              className="field mt-1 w-full rounded-xl border p-2.5"
              type="date"
              value={from}
              max={to}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="text-sm font-medium">
            To
            <input
              className="field mt-1 w-full rounded-xl border p-2.5"
              type="date"
              value={to}
              min={from}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <Button variant="secondary" onClick={() => void result.refetch()}>
            <RefreshCw size={16} /> Refresh
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="slate">{config.title}</Badge>
          {report === 'collections' && (
            <select
              aria-label="Collection grouping"
              className="field rounded-lg border px-3 py-2 text-sm"
              value={period}
              onChange={(event) => setPeriod(event.target.value as typeof period)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
          {report === 'subscriptions' && (
            <select
              aria-label="Subscription report type"
              className="field rounded-lg border px-3 py-2 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setPage(1);
              }}
            >
              <option value="ACTIVE">Active subscriptions</option>
              <option value="EXPIRED">Expired subscriptions</option>
              <option value="UPCOMING">Upcoming renewals</option>
            </select>
          )}
          <span className="text-sm text-slate-500">{config.description}</span>
        </div>
      </Panel>
      {result.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="col-span-full h-72" />
        </div>
      ) : result.isError || !data ? (
        <ErrorState retry={() => void result.refetch()} />
      ) : (
        <>
          <SummaryCards summary={data.summary} />
          {chartEnabled && (
            <Panel className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-[#C8102E]" />
                <h2 className="font-semibold">{config.title} trend</h2>
                <span className="ml-auto text-xs text-slate-500">INR · Asia/Kolkata</span>
              </div>
              {items.length ? (
                <BarChart rows={items} selected={report} />
              ) : (
                <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <span className="grid size-11 place-items-center rounded-xl bg-rose-50 text-[#C8102E]">
                    <TrendingUp size={20} />
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-800">No activity in this period</h3>
                  <p className="mt-1 max-w-md text-sm text-slate-500">
                    There are no matching records for these dates. Try a wider range, or record a
                    payment to see collection activity.
                  </p>
                  {report === 'collections' && (
                    <Link
                      to="/admin/payments"
                      className="mt-3 text-sm font-semibold text-[#C8102E] hover:underline"
                    >
                      Open payments
                    </Link>
                  )}
                </div>
              )}
            </Panel>
          )}
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="font-semibold">{config.title} detail</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {data.pagination?.total ?? items.length} matching records
                </p>
              </div>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <CalendarDays size={15} /> {from} — {to}
              </span>
            </div>
            {items.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {headers.map((key) => (
                        <th key={key} className="px-4 py-3">
                          {key.replace(/([A-Z])/g, ' $1').replaceAll('_', ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, index) => (
                      <tr
                        key={String(
                          row.id ??
                            row.invoiceId ??
                            row.employeeId ??
                            row.date ??
                            row.product ??
                            index,
                        )}
                        className="border-t border-slate-100"
                      >
                        {headers.map((key) => (
                          <td key={key} className="px-4 py-3">
                            {key === 'status' ? (
                              <Badge
                                tone={
                                  ['FAILED', 'EXPIRED', 'OVERDUE'].includes(String(row[key]))
                                    ? 'red'
                                    : 'slate'
                                }
                              >
                                {String(row[key])}
                              </Badge>
                            ) : (
                              cell(row[key], key)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No matching report data"
                description="Try a different date range or report filter."
              />
            )}
            {data.pagination && data.pagination.pages > 1 && (
              <div className="flex items-center justify-end gap-3 border-t p-4">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <span className="text-sm text-slate-500">
                  Page {page} of {data.pagination.pages}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </Panel>
          {data.note && <p className="text-xs text-slate-500">{data.note}</p>}
        </>
      )}
    </main>
  );
}
