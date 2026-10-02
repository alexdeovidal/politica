import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { getSidebarCounts } from "@/lib/stats";

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
  title: "POLITICA — busca de candidatos",
  description:
    "Cruzamento de dados públicos de políticos brasileiros por CPF/CNPJ. Indício, não prova — todo campo aponta para a fonte oficial de onde saiu.",
};

// Runs before hydration so a saved theme applies with no flash.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  const counts = getSidebarCounts();
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
        <AppShell counts={counts} aiReviewEnabled={aiReviewEnabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
