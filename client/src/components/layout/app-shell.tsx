import { Outlet } from 'react-router-dom';

export function AppShell() {
  return (
    <div className="min-h-screen bg-surface text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4 sm:px-8">
          <div
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-xl bg-navy text-sm font-bold tracking-wide text-white"
          >
            VRK
          </div>
          <div>
            <p className="font-semibold text-navy">Virtual Raksha Kavach</p>
            <p className="text-xs text-slate-500">Business workspace</p>
          </div>
          <span className="ml-auto rounded-full border border-cyan/20 bg-cyan/5 px-3 py-1 text-xs font-medium text-cyan">
            Foundation
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <Outlet />
      </main>
    </div>
  );
}
