import type {Metadata} from "next";
import Link from "next/link";
import {getLiveResultSnapshot, listLiveResultSnapshots} from "@/lib/live-election/service";
import {historySelectionFromParams} from "@/lib/live-election/model";
import "../apuracao.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = {title: "Histórico da apuração · Politica007", description: "Consulte versões anteriores dos resultados eleitorais guardadas pelo Politica007."};

const number = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
function dateTime(value: string | null) {
  if (!value) return "Ainda não totalizado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium"});
}
function progressLabel(progress: string) {
  return progress === "final" ? "Resultado final" : progress === "counted" ? "Seções totalizadas" : progress === "partial" ? "Parcial" : "Aguardando apuração";
}
function selectionQuery(selection: {turn: number; office: string; state: string; municipality: string; zone: string}) {
  const params = new URLSearchParams({turno: String(selection.turn), cargo: selection.office, uf: selection.state});
  if (selection.municipality) params.set("municipio", selection.municipality);
  if (selection.zone) params.set("zona", selection.zone);
  return params.toString();
}

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const raw = await searchParams, params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  const id = params.get("id");
  const parsedId = Number(id);
  const selected = id && /^\d+$/.test(id) && Number.isSafeInteger(parsedId) && parsedId > 0 ? getLiveResultSnapshot(parsedId) : null;
  const selection = selected?.result.selection || (() => {try {return historySelectionFromParams(params);} catch {return null;}})();
  const snapshots = !id && selection ? listLiveResultSnapshots(selection) : [];
  const returnHref = selection ? `/apuracao?${selectionQuery(selection)}` : "/apuracao";

  return <main className="live-election"><div className="live-election__inner">
    <header className="live-header"><Link href={returnHref} className="live-button live-button--portal">← Voltar para a apuração</Link><Link href="/" className="live-button">Politica007</Link></header>
    <section className="live-history-panel" aria-labelledby="history-title">
      {selected ? <>
        <span className="live-eyebrow">HISTÓRICO SALVO · ELEIÇÕES {selected.result.election.cycle.slice(3)}</span>
        <h1 id="history-title">{selected.result.office.name} · {selected.result.areaName}</h1>
        <p className="live-history-caption">Versão registrada em {dateTime(selected.firstSeenAt)} · dados do TSE gerados em {dateTime(selected.generatedAt)}.</p>
        {selected.stale && <p className="live-notice">Esta versão foi exibida enquanto a fonte oficial estava indisponível.</p>}
        <div className="live-history-metrics"><div><strong>{progressLabel(selected.result.progress)}</strong><span>situação</span></div><div><strong>{percent.format(selected.result.sections.percentage)}%</strong><span>seções totalizadas</span></div><div><strong>{number.format(selected.result.votes.valid ?? 0)}</strong><span>votos válidos</span></div><div><strong>{number.format(selected.result.candidates.length)}</strong><span>candidaturas</span></div></div>
        <div className="live-history-candidates"><div className="live-section-heading"><h2>Candidaturas nesta versão</h2><span className="live-count">Totalização {dateTime(selected.totalizedAt)}</span></div>
          <ol>{selected.result.candidates.map((candidate, index) => <li key={`${candidate.id}-${index}`}><span className="live-history-rank">{index + 1}</span><div><strong>{candidate.name}</strong><small>{candidate.party} · número {candidate.number}{candidate.status ? ` · ${candidate.status}` : ""}</small></div><div className="live-history-votes"><strong>{candidate.votes === null ? "—" : number.format(candidate.votes)}</strong><small>{candidate.percentage === null ? "" : `${percent.format(candidate.percentage)}%`}</small></div></li>)}</ol>
        </div>
        <div className="live-history-actions"><Link className="live-button live-button--primary" href={`/apuracao/historico?${selectionQuery(selected.result.selection)}`}>Ver outras versões deste recorte</Link><Link className="live-source-link" href={selected.result.sourceUrl} target="_blank" rel="noopener noreferrer">Arquivo oficial do TSE</Link></div>
      </> : id ? <>
        <span className="live-eyebrow">HISTÓRICO DA APURAÇÃO</span><h1 id="history-title">Resultado não encontrado</h1><p className="live-history-caption">Esse identificador não corresponde a uma versão guardada.</p><Link href="/apuracao" className="live-button live-button--primary">Abrir apuração</Link>
      </> : selection ? <>
        <span className="live-eyebrow">HISTÓRICO SALVO · ELEIÇÕES 2026</span><h1 id="history-title">{snapshots.length ? `${snapshots[0].officeName} · ${snapshots[0].areaName}` : "Histórico do recorte"}</h1>
        <p className="live-history-caption">Versões distintas recebidas do TSE e guardadas no banco persistente. A consulta ao vivo continua em outra tela.</p>
        {snapshots.length ? <ol className="live-history-list">{snapshots.map(snapshot => <li key={snapshot.id}><Link href={`/apuracao/historico?id=${snapshot.id}`}><span><strong>{progressLabel(snapshot.progress)}{snapshot.stale ? " · fonte indisponível" : ""}</strong><small>Registrado {dateTime(snapshot.firstSeenAt)} · TSE {dateTime(snapshot.generatedAt)}</small></span><span className="live-history-list__stats">{percent.format(snapshot.sectionsPercentage)}% das seções<br/>{number.format(snapshot.sectionsCounted)} de {number.format(snapshot.sectionsTotal)}</span><span aria-hidden="true">›</span></Link></li>)}</ol> : <div className="live-empty"><h2>Nenhuma versão salva para este recorte ainda</h2><p>Abra a apuração ao vivo. Cada versão recebida do TSE será guardada aqui para consulta futura.</p><Link href={returnHref} className="live-button live-button--primary">Consultar este recorte</Link></div>}
      </> : <>
        <span className="live-eyebrow">HISTÓRICO DA APURAÇÃO</span><h1 id="history-title">Selecione um recorte válido</h1><p className="live-history-caption">Volte à apuração e abra o histórico pelo recorte que deseja consultar.</p><Link href="/apuracao" className="live-button live-button--primary">Abrir apuração</Link>
      </>}
    </section>
  </div></main>;
}
