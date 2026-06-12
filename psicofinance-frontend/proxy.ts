import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/server';

export async function proxy(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // Refresca la sesión si existe (no lanza error si no hay sesión)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si no está autenticado y pide una ruta protegida → redirige al login
  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/pacientes/:path*', '/reportes/:path*', '/egresos/:path*', '/agenda/:path*'],
};
