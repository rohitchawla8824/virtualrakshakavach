import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from '@/lib/api/health';

export function FoundationPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });

  const apiIsHealthy = health.data?.status === 'ok';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-auto max-w-3xl"
    >
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan">
        Project foundation
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy sm:text-4xl">
        Your business workspace starts here.
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
        The application shell and API are connected. Customer, employee, finance, and subscription
        workflows will be added in their approved development phases.
      </p>

      <div className="mt-9 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">API connection</h2>
            <p className="mt-1 text-sm text-slate-500">
              Live status from the local health-check endpoint
            </p>
          </div>
          <div
            role="status"
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
              health.isPending
                ? 'bg-slate-100 text-slate-600'
                : apiIsHealthy
                  ? 'bg-emerald-50 text-success'
                  : 'bg-amber-50 text-warning'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${
                health.isPending ? 'bg-slate-400' : apiIsHealthy ? 'bg-success' : 'bg-warning'
              }`}
            />
            {health.isPending ? 'Checking API' : apiIsHealthy ? 'API connected' : 'API unavailable'}
          </div>
        </div>

        {health.isError && (
          <p className="mt-4 text-sm text-slate-600">
            Start the backend with{' '}
            <code className="rounded bg-slate-100 px-1.5 py-0.5">npm run dev</code> from the project
            root, then this status will refresh automatically.
          </p>
        )}
      </div>
    </motion.section>
  );
}
