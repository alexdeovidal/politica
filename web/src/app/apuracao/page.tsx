import type {Metadata} from "next";
import {LiveElectionDashboard} from "@/components/live-election/dashboard";
import {selectionFromParams} from "@/lib/live-election/model";
import "./apuracao.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Apuração ao vivo · Eleições 2026 | Politica007",
  description: "Acompanhe a apuração das Eleições 2026 com dados oficiais do TSE. Filtre por estado, cidade, zona e cargo. Modo de apresentação para TV e atualização automática.",
  alternates: {canonical: "/apuracao"},
};

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const raw = await searchParams, params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  const selection = selectionFromParams(params);

  // Render the dashboard shell immediately; its client effects load the TSE files.
  return <LiveElectionDashboard
    initialSelection={selection}
    initialConfig={null}
    initialResult={null}
    initialOverview={null}
    initialError={null}
    initialTv={params.get("tv") === "1"}
    initialQuery={params.get("busca") || ""}
    initialParty={params.get("partido") || ""}
    initialCountry={/^[A-Z]{2}$/.test(params.get("pais") || "") ? params.get("pais")! : ""}
    initialNow={Date.now()}
  />;
}
