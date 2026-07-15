// Loading global: se muestra mientras Next.js prepara el route segment.
// Skeleton minimalista que coincide con el layout del dashboard.

export default function Loading() {
  return (
    <main className="mx-auto max-w-screen-lg px-4 py-6 lg:py-8">
      <div className="flex flex-col gap-4">
        {/* Copilot skeleton */}
        <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" />

        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" />
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" />
          <div className="h-72 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10" />
        </div>
      </div>
    </main>
  );
}
