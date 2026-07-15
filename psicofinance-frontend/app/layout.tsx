import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Fuente mono para montos y números — tabular, legible, con carácter fintech
const jetbrains = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:  "PsicoFinance — Asistente financiero para consultorios",
    template: "%s · PsicoFinance",
  },
  description: "Gestioná turnos, monitoreá tu Monotributo y registrá ingresos con IA. Diseñado para psicólogos en Argentina.",
  applicationName: "PsicoFinance",
  authors: [{ name: "Nicolás Corradi" }],
  keywords: ["psicología", "finanzas", "monotributo", "consultorio", "argentina", "fintech"],
  openGraph: {
    title: "PsicoFinance — Tu consultorio bajo control",
    description: "Cash flow, alertas de honorarios e IA para registrar turnos por chat. Pensado para psicólogos en Argentina.",
    type: "website",
    locale: "es_AR",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
