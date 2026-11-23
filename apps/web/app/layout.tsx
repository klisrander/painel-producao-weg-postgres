import type { Metadata } from "next";
import "./style.css";
import { headers } from "next/headers";
export const metadata: Metadata = {
  title: "Painel de produção",
  description: "Resultados, capacidade e evolução da produção.",
  robots: { index: false, follow: false },
};
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers();
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
