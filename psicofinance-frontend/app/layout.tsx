import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Plus Jakarta Sans: redonda, minimalista, excelente legibilidad — estilo iOS moderno
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PsicoFinance",
  description: "Tu asistente financiero para el consultorio",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={jakarta.variable}>
      <body className="min-h-screen bg-[#F2F2F7] text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
