import type {Metadata} from "next";
import {LiveElectionDashboard} from "@/components/live-election/dashboard";
import {selectionFromParams, type LiveOverview, type LiveResult, type PublicConfig} from "@/lib/live-election/model";
import {getLiveConfig, getLiveOverview, getLiveResult, publicConfig, unavailableResultMessage} from "@/lib/live-election/service";
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
  let config: PublicConfig | null = null, result: LiveResult | null = null, overview: LiveOverview | null = null, error: string | null = null;
  try {
    config = publicConfig(await getLiveConfig(selection.turn), selection.state);
    if (selection.state !== "br" || selection.office === "1") {
      const responses = await Promise.allSettled([getLiveResult(selection), getLiveOverview(selection)]);
      if (responses[0].status === "fulfilled") result = responses[0].value; else error = unavailableResultMessage(responses[0].reason).error;
      if (responses[1].status === "fulfilled") overview = responses[1].value;
    }
  } catch (failure) { error = unavailableResultMessage(failure).error; }
  return <LiveElectionDashboard initialSelection={selection} initialConfig={config} initialResult={result} initialOverview={overview} initialError={error} initialTv={params.get("tv") === "1"} initialQuery={params.get("busca") || ""} initialParty={params.get("partido") || ""} initialCountry={/^[A-Z]{2}$/.test(params.get("pais") || "") ? params.get("pais")! : ""} initialNow={Date.parse(result?.checkedAt || config?.checkedAt || "1970-01-01T00:00:00Z")}/>;
}
