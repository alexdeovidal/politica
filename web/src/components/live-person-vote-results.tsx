"use client";

import { ChevronDown, ExternalLink, MapPin, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PersonVoteResult } from "@/lib/queries";
import { LiveSectionVoteBreakdown } from "@/components/live-election/section-vote-breakdown";
import {
  LIVE_POLL_SECONDS,
  isLiveResultComplete,
  normalizeLiveSearch,
  type LiveResult,
  type PublicConfig,
} from "@/lib/live-election/model";

type ApiMessage = { error?: string };

function officeCode(value: string | null): string | null {
  const office = normalizeLiveSearch(value || "");
  if (office.includes("presidente")) return "1";
  if (office.includes("governador")) return "3";
  if (office.includes("senador")) return "5";
  if (office.includes("deputado federal")) return "6";
  if (office.includes("deputado distrital")) return "8";
  if (office.includes("deputado estadual")) return "7";
  if (office.includes("conselheiro distrital")) return "25";
  return null;
}

function matchingCandidate(result: LiveResult, profile: PersonVoteResult) {
  if (profile.tseCandidacyId) {
    const exactId = result.candidates.find((candidate) => candidate.id === profile.tseCandidacyId);
    if (exactId) return exactId;
  }
  if (!profile.candidateNumber) return null;

  const byNumberAndParty = result.candidates.filter((candidate) =>
    candidate.number === profile.candidateNumber &&
    (!profile.partyAbbr || normalizeLiveSearch(candidate.party) === normalizeLiveSearch(profile.partyAbbr)),
  );
  if (byNumberAndParty.length === 1) return byNumberAndParty[0];

  const profileNames = [profile.ballotName, profile.fullName]
    .filter((name): name is string => Boolean(name))
    .map(normalizeLiveSearch);
  return byNumberAndParty.find((candidate) =>
    [candidate.name, candidate.legalName].some((name) => profileNames.includes(normalizeLiveSearch(name))),
  ) || null;
}

function formatDate(value: string | null) {
  if (!value) return "aguardando horário oficial";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

export function LivePersonVoteResults({ result: profile, initiallyOpen }: { result: PersonVoteResult; initiallyOpen: boolean }) {
  const cargo = officeCode(profile.office);
  const isPresident = cargo === "1";
  const candidateState = (profile.state || "").toLowerCase();
  const [turn, setTurn] = useState(profile.round === 2 ? 2 : 1);
  const [state, setState] = useState(isPresident ? "br" : /^[a-z]{2}$/.test(candidateState) ? candidateState : "");
  const [municipality, setMunicipality] = useState("");
  const [zone, setZone] = useState("");
  const [loadedConfig, setLoadedConfig] = useState<{ state: string; config: PublicConfig } | null>(null);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [configError, setConfigError] = useState("");
  const [resultError, setResultError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(initiallyOpen);
  const config = loadedConfig?.state === state ? loadedConfig.config : null;

  useEffect(() => {
    if (!state || !cargo) return;
    const controller = new AbortController();
    fetch(`/api/apuracao/config?turno=${turn}&uf=${encodeURIComponent(state)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as (PublicConfig & ApiMessage) | null;
        if (!response.ok || !data || !data.elections) throw new Error(data?.error || "Não foi possível carregar as localidades oficiais.");
        return data;
      })
      .then((data) => {
        setLoadedConfig({ state, config: data });
        setConfigError("");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setConfigError(error instanceof Error ? error.message : "Não foi possível carregar as localidades oficiais.");
      });
    return () => controller.abort();
  }, [state, turn, cargo]);

  const municipalities = config?.municipalities || [];
  const selectedMunicipality = municipalities.find((item) => item.code === municipality);
  const zones = useMemo(() => selectedMunicipality?.zones || [], [selectedMunicipality]);
  const candidate = useMemo(() => live ? matchingCandidate(live, profile) : null, [live, profile]);

  useEffect(() => {
    if (!open || !config || !state || !cargo || (municipality && !selectedMunicipality) || (zone && !zones.includes(zone))) return;
    let stopped = false;
    let completed = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(refresh, LIVE_POLL_SECONDS * 1000);
        return;
      }
      setLoading(true);
      setResultError("");
      const params = new URLSearchParams({ turno: String(turn), cargo, uf: state });
      if (municipality) params.set("municipio", municipality);
      if (zone) params.set("zona", zone);
      try {
        const response = await fetch(`/api/apuracao/results?${params}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json().catch(() => null) as (LiveResult & ApiMessage) | null;
        if (!response.ok || !data || !Array.isArray(data.candidates)) throw new Error(data?.error || "Não foi possível consultar a apuração agora.");
        if (!stopped) {
          setLive(data);
          completed = isLiveResultComplete(data);
        }
      } catch (error) {
        if (!stopped && !controller.signal.aborted) setResultError(error instanceof Error ? error.message : "Não foi possível consultar a apuração agora.");
      } finally {
        if (!stopped) {
          setLoading(false);
          if (!completed) timer = window.setTimeout(refresh, LIVE_POLL_SECONDS * 1000);
        }
      }
    };
    void refresh();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [open, config, state, turn, cargo, municipality, zone, selectedMunicipality, zones]);

  const stateOptions = config?.states || [];
  const turnOptions = [...new Set(config?.elections.map((item) => item.turn) || [turn])].sort();
  const stateName = stateOptions.find((item) => item.code === state)?.name || state.toUpperCase();
  const officeName = profile.office || "cargo não informado";
  const profileName = profile.ballotName || profile.fullName || "candidatura";
  const referenceLink = live?.sourceUrl || "https://resultados.tse.jus.br/oficial/app/index.html";

  return (
    <details className="group card !p-0" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface-2)] text-[var(--accent-2)]">
          <Radio className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-[var(--fg-1)]">2026 · {officeName} · {turn}º turno</span>
          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--muted-2)]">{live && isLiveResultComplete(live) ? live.completedAt ? "Resultado armazenado no histórico" : "Votação encerrada · totalização do TSE" : "Apuração atualizada pela totalização do TSE"}</span>
        </span>
        {live ? <span className={`hidden shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] sm:inline-flex ${isLiveResultComplete(live) ? "border-[var(--border-1)] text-[var(--muted)]" : "border-[var(--accent-2)]/30 text-[var(--accent-2)]"}`}>{isLiveResultComplete(live) ? "ENCERRADA" : "AO VIVO"}</span> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-2)] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>

      <div className="border-t border-[var(--border-1)] px-3 py-4 sm:px-5">
        {!cargo ? (
          <p className="text-[12px] text-[var(--muted)]">Não foi possível identificar o cargo desta candidatura para consultar a apuração de 2026.</p>
        ) : !state ? (
          <p className="text-[12px] text-[var(--muted)]">O cadastro desta candidatura não informa a UF necessária para consultar os resultados oficiais.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              {turnOptions.length > 1 ? (
                <label className="flex min-w-[125px] flex-1 flex-col gap-1.5 text-[11px] text-[var(--muted)]">
                  Turno
                  <select className="input min-h-10 w-full" value={turn} onChange={(event) => { setTurn(Number(event.target.value)); setLive(null); }}>
                    {turnOptions.map((item) => <option key={item} value={item}>{item}º turno</option>)}
                  </select>
                </label>
              ) : null}
              {isPresident || !candidateState ? (
                <label className="flex min-w-[190px] flex-1 flex-col gap-1.5 text-[11px] text-[var(--muted)]">
                  Estado
                  <select className="input min-h-10 w-full" value={state} onChange={(event) => { setState(event.target.value); setMunicipality(""); setZone(""); setLive(null); }}>
                    <option value="br">Brasil · total nacional</option>
                    {stateOptions.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                  </select>
                </label>
              ) : (
                <div className="flex min-h-10 min-w-[150px] items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-1)] px-3 text-[12px] text-[var(--fg-2)]">
                  <MapPin className="h-4 w-4 text-[var(--accent-2)]" aria-hidden="true" />
                  {stateName}
                </div>
              )}
              <label className="flex min-w-[190px] flex-1 flex-col gap-1.5 text-[11px] text-[var(--muted)]">
                Município
                <select className="input min-h-10 w-full" value={municipality} disabled={state === "br" || !municipalities.length} onChange={(event) => { setMunicipality(event.target.value); setZone(""); setLive(null); }}>
                  <option value="">{state === "br" ? "Escolha um estado primeiro" : "Todo o estado"}</option>
                  {municipalities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
              </label>
              <label className="flex min-w-[130px] flex-1 flex-col gap-1.5 text-[11px] text-[var(--muted)]">
                Zona eleitoral
                <select className="input min-h-10 w-full" value={zone} disabled={!municipality || !zones.length} onChange={(event) => { setZone(event.target.value); setLive(null); }}>
                  <option value="">Todas as zonas</option>
                  {zones.map((item) => <option key={item} value={item}>Zona {Number(item)}</option>)}
                </select>
              </label>
            </div>

            {configError ? <p role="alert" className="mb-3 text-[12px] text-[var(--danger)]">{configError}</p> : null}
            {resultError ? <p role="alert" className="mb-3 text-[12px] text-[var(--danger)]">{resultError}</p> : null}
            {!config && !configError ? <p className="py-4 text-[12px] text-[var(--muted)]">Carregando localidades oficiais…</p> : null}
            {config && loading && !live ? <p className="py-4 text-[12px] text-[var(--muted)]">Consultando o resultado oficial do TSE…</p> : null}

            {live && !live.votingReleased ? (
              <p className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--surface)] px-3 py-3 text-[12px] text-[var(--muted)]">
                O TSE ainda não liberou os votos neste recorte. A consulta tentará novamente automaticamente.
              </p>
            ) : live && !candidate ? (
              <p className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--surface)] px-3 py-3 text-[12px] text-[var(--muted)]">
                Não encontramos esta candidatura no arquivo oficial para o recorte escolhido. Confira os dados de cargo, número e partido no cadastro.
              </p>
            ) : live && candidate ? (
              <div aria-live="polite" className="rounded-[var(--r-md)] border border-[var(--border-1)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-[var(--accent-2)]">
                      <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
                      {live.progress === "final" ? "resultado final do TSE" : isLiveResultComplete(live) ? "seções totalizadas" : "totalização em andamento"}
                    </div>
                    <h3 className="mt-2 break-words text-[15px] font-medium text-[var(--fg-1)]">{candidate.name || profileName}</h3>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">{candidate.party || profile.partyAbbr || "Partido não informado"} · {live.areaName}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <strong className="block font-mono text-[28px] leading-none text-[var(--fg-1)]">{(candidate.votes ?? 0).toLocaleString("pt-BR")}</strong>
                    <span className="mt-1 block text-[10px] text-[var(--muted)]">votos nominais{candidate.percentage != null ? ` · ${candidate.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : ""}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-1)] pt-3 text-[10px] text-[var(--muted-2)]">
                  <span>{live.sections.counted.toLocaleString("pt-BR")} de {live.sections.total.toLocaleString("pt-BR")} seções totalizadas · {live.sections.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                  <span>Dados gerados pelo TSE: {formatDate(live.generatedAt)} · portal consultou: {formatDate(live.checkedAt)}{live.stale ? " · último dado disponível" : ""}</span>
                </div>
                {municipality ? <LiveSectionVoteBreakdown selection={live.selection} candidate={candidate} finalized={isLiveResultComplete(live)}/> : null}
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-2xl text-[10px] leading-relaxed text-[var(--muted-2)]">
                {live && isLiveResultComplete(live)
                  ? live.completedAt
                    ? `Resultado encerrado e salvo no banco do Politica007 em ${formatDate(live.completedAt)}. Os boletins oficiais permanecem disponíveis para consulta por seção.`
                    : "Todas as seções foram totalizadas pelo TSE. Os boletins oficiais permanecem disponíveis para consulta por seção."
                  : `A cada ${LIVE_POLL_SECONDS} segundos o Politica007 consulta a totalização. Os boletins por urna são conferidos a cada minuto quando a consulta por seção está aberta; o TSE pode publicar ou republicar esses arquivos em horários diferentes.`}
              </p>
              <a href={referenceLink} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-[var(--accent-2)] hover:underline">
                Resultado oficial do TSE <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </>
        )}
      </div>
    </details>
  );
}
