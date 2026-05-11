import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3rem)] lg:min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100">
          <Search className="h-7 w-7 text-indigo-600" strokeWidth={1.8} />
        </div>

        <h1 className="text-6xl font-bold tracking-tight text-neutral-900">404</h1>
        <p className="mt-2 text-lg font-semibold text-neutral-700">Página no encontrada</p>
        <p className="mt-2 text-sm text-neutral-500">
          La sección que estás buscando no existe o fue movida.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
          >
            <Home className="h-4 w-4" />
            Volver al dashboard
          </Link>
          <Link
            href="/pacientes"
            className="rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
          >
            Ver pacientes
          </Link>
        </div>
      </div>
    </main>
  );
}
