import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relatórios de Atendimento Tomasoni",
  description: "Aplicação corporativa para registros de atendimento técnico."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
