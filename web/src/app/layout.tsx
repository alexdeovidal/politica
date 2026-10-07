import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase:new URL("https://politica007.com.br"),
  openGraph:{siteName:"Politica007",locale:"pt_BR",type:"website",images:["/api/share"]},
  twitter:{card:"summary_large_image",images:["/api/share"]},
  title: "Politica007 — portal independente de dados públicos",
  description:
    "Portal independente para consultar dados públicos eleitorais por CPF/CNPJ, com fontes identificadas. Não é um serviço oficial do TSE ou do Governo.",
};

// Runs before hydration so a saved theme applies with no flash.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const aiReviewEnabled = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground font-sans">
        <AppShell aiReviewEnabled={aiReviewEnabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
