import { ExternalLink, Scale } from "lucide-react";
import type {
  ElectoralCaseAppeal,
  ElectoralCaseDecision,
  ElectoralCaseSubject,
  PersonElectoralCases as PersonElectoralCasesData,
  PublicElectoralCase,
} from "@/lib/queries";
import { SourceZone } from "@/components/source-zone";

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function PersonElectoralCases({ data }: { data: PersonElectoralCasesData }) {
  return (
    <section id="processos-eleitorais" data-toc-title="processos eleitorais" className="animate-in py-7">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="section-title">processos eleitorais</h2>
        {data.available && data.cases.length > 0 ? (
          <span className="font-mono text-[10px] text-[var(--muted-2)]">
            {data.cases.length.toLocaleString("pt-BR")} {data.cases.length === 1 ? "processo" : "processos"}
          </span>
        ) : null}
      </div>
      <p className="mb-4 max-w-3xl text-[12px] leading-relaxed text-[var(--muted)]">
        Registros públicos dos conjuntos Processual do TSE, associados pelo código oficial da candidatura.
        Cada processo, assunto e decisão aparece abaixo com seus dados e fonte.
      </p>

      {!data.available ? (
        <div className="card flex flex-col items-start gap-3 p-4 sm:p-5">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            A base processual do TSE ainda não foi carregada neste perfil.
          </p>
          <a
            href="https://consultaunificadapje.tse.jus.br/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn inline-flex items-center gap-2"
          >
            Consultar o PJe Eleitoral <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      ) : data.cases.length === 0 ? (
        <div className="card p-4 sm:p-5">
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            Nenhum registro foi associado a esta pessoa pelo código de candidatura nos arquivos processuais
            importados do TSE. Isso não confirma que a pessoa nunca respondeu a um processo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.cases.map((item) => <CaseCard key={item.id} item={item} />)}
        </div>
      )}

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-[var(--muted-2)]">
        O conjunto cobre a Justiça Eleitoral nos pleitos com arquivos processuais disponíveis (2018–2026).
        Processos em sigilo não aparecem. A existência de um processo não significa culpa ou condenação;
        a situação deve ser conferida nas decisões oficiais. Processos de outras áreas da Justiça não estão
        incluídos nesta base.
      </p>
    </section>
  );
}

function CaseCard({ item }: { item: PublicElectoralCase }) {
  const closedAt = dateLabel(item.closedAt);
  const court = item.courtState ? `TRE-${item.courtState}` : "Justiça Eleitoral";
  const instance = item.instance ? `${item.instance}ª instância` : null;
  const parties = item.parties.filter((party, index, all) =>
    all.findIndex((candidate) =>
      candidate.candidacyYear === party.candidacyYear && candidate.pole === party.pole &&
      candidate.type === party.type && candidate.name === party.name,
    ) === index,
  );

  return (
    <details className="group card !p-0">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface-2)] text-[var(--accent-2)]">
            <Scale className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12px] font-medium text-[var(--fg-1)]">
              {item.caseNumber}
            </span>
            <span className="mt-1 block truncate text-[11px] text-[var(--muted-2)]">
              {item.className ?? "Classe não informada"} · {court}{instance ? ` · ${instance}` : ""}
            </span>
          </span>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[9px] ${
            closedAt
              ? "border-[var(--border-1)] text-[var(--muted-2)]"
              : "border-[var(--border-1)] bg-[var(--surface-2)] text-[var(--accent-2)]"
          }`}>
            {closedAt ? `encerrado ${closedAt}` : "sem baixa informada na base"}
          </span>
          <span className="hidden shrink-0 text-right sm:block">
            <span className="block font-mono text-[10px] text-[var(--muted-2)]">base TSE</span>
            <span className="block font-mono text-[12px] text-[var(--fg-2)]">{item.electionYear}</span>
          </span>
          <span className="ml-1 text-[var(--muted-2)] transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>

        <div className="border-t border-[var(--border-1)] px-4 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <Field label="tipo" value={item.isAppeal == null ? null : item.isAppeal ? "processo recursal" : "processo originário"} />
            <Field label="assunto principal" value={item.mainSubject} />
            <Field label="código do assunto principal" value={item.mainSubjectCode} />
            <Field label="sigla da classe" value={item.classAbbr} />
            <Field label="código da classe" value={item.classCode} />
            <Field label="última decisão" value={item.lastDecisionType} />
            <Field label="autuação" value={dateLabel(item.filedAt)} />
            <Field label="última movimentação decisória" value={dateLabel(item.lastDecisionAt)} />
            <Field label="distribuição" value={dateLabel(item.distributedAt)} />
            <Field label="distribuição processual" value={item.distributionType} />
            <Field label="relator(a)" value={item.reporter} />
            <Field label="origem" value={
              [item.originState, item.originInstance ? `${item.originInstance}ª instância` : null]
                .filter(Boolean).join(" · ") || null
            } />
            <Field label="decisões registradas" value={item.decisionCount?.toLocaleString("pt-BR") ?? null} />
            <Field label="identificação da parte" value={parties.map((party) =>
              [party.pole, party.type, party.isMain == null ? null : party.isMain ? "parte principal" : "parte não principal"]
                .filter(Boolean).join(" · ")
            ).join(" / ") || null} />
          </div>

          {parties.length > 0 ? (
            <div className="mt-4 border-t border-[var(--border-1)] pt-3">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">
                vínculo de candidatura informado pelo TSE
              </div>
              <ul className="flex flex-col gap-1.5">
                {parties.map((party, index) => (
                  <li key={`${party.candidacyYear}-${party.pole}-${party.type}-${index}`} className="text-[11px] text-[var(--fg-2)]">
                    <span className="font-medium">{party.name ?? party.socialName ?? "Candidato(a)"}</span>
                    <span className="text-[var(--muted-2)]">
                      {` · ${party.candidacyYear}`}{party.pole ? ` · ${party.pole}` : ""}
                      {party.type ? ` · ${party.type}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {item.subjects.length > 0 ? (
            <RelatedList title="assuntos do processo">
              {item.subjects.map((subject, index) => (
                <li key={`${subject.code}-${index}`} className="text-[11px] leading-relaxed text-[var(--fg-2)]">
                  <SourceZone provenance={subject.provenance} inline>
                    <span>{subject.subject}{subject.code ? <span className="ml-2 font-mono text-[9px] text-[var(--muted-2)]">{subject.code}</span> : null}</span>
                  </SourceZone>
                </li>
              ))}
            </RelatedList>
          ) : null}

          {item.decisions.length > 0 ? (
            <RelatedList title={`histórico de decisões · ${item.decisions.length}`}>
              {item.decisions.map((decision, index) => <DecisionRow key={`${decision.sequence}-${decision.date}-${index}`} decision={decision} />)}
            </RelatedList>
          ) : null}

          {item.appeals.length > 0 ? (
            <RelatedList title={`recursos registrados · ${item.appeals.length}`}>
              {item.appeals.map((appeal, index) => <AppealRow key={`${appeal.id}-${index}`} appeal={appeal} />)}
            </RelatedList>
          ) : null}

          {item.sourceUrl ? (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn mt-4 inline-flex min-h-10 items-center gap-2"
            >
              Ver processo e documentos oficiais <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}

          <div className="mt-4 border-t border-[var(--border-1)] pt-3 text-[10px] text-[var(--muted-2)]">
            Fonte dos dados deste processo: <SourceZone provenance={item.provenance} inline>
              <span className="cursor-pointer underline decoration-dotted underline-offset-2">conjunto Processual do TSE</span>
            </SourceZone>
          </div>
        </div>
      </details>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--muted-2)]">{label}</div>
      <div className="break-words text-[11px] leading-relaxed text-[var(--fg-2)]">{value}</div>
    </div>
  );
}

function RelatedList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-[var(--border-1)] pt-3">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--muted-2)]">{title}</div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function DecisionRow({ decision }: { decision: ElectoralCaseDecision }) {
  return (
      <li className="flex flex-col gap-0.5 text-[11px] leading-relaxed text-[var(--fg-2)] sm:flex-row sm:gap-3">
        <span className="shrink-0 font-mono text-[10px] text-[var(--muted-2)]">{dateLabel(decision.date) ?? "Data não informada"}</span>
        <SourceZone provenance={decision.provenance} inline>
          <span>{decision.type ?? "Decisão"}{decision.author ? ` · ${decision.author}` : ""}</span>
        </SourceZone>
      </li>
  );
}

function AppealRow({ appeal }: { appeal: ElectoralCaseAppeal }) {
  const status = appeal.closedAt ? `encerrado em ${dateLabel(appeal.closedAt)}` : "sem baixa informada";
  return (
      <li className="text-[11px] leading-relaxed text-[var(--fg-2)]">
        <SourceZone provenance={appeal.provenance} inline>
          <span>
            <span className="font-medium">{appeal.type ?? appeal.className ?? "Recurso"}</span>
            {appeal.filedAt ? <span className="text-[var(--muted-2)]"> · autuado em {dateLabel(appeal.filedAt)}</span> : null}
            <span className="text-[var(--muted-2)]"> · {status}</span>
            {appeal.nature ? <span className="text-[var(--muted-2)]"> · {appeal.nature}</span> : null}
            {appeal.courtState ? <span className="text-[var(--muted-2)]"> · {appeal.courtState}{appeal.instance ? ` · ${appeal.instance}ª instância` : ""}</span> : null}
            {appeal.lastDecisionType ? <span className="text-[var(--muted-2)]"> · última decisão: {appeal.lastDecisionType}</span> : null}
            {appeal.lastDecisionAt ? <span className="ml-1 font-mono text-[9px] text-[var(--muted-2)]">({dateLabel(appeal.lastDecisionAt)})</span> : null}
            {appeal.reporter ? <span className="text-[var(--muted-2)]"> · relator(a): {appeal.reporter}</span> : null}
          </span>
        </SourceZone>
      </li>
  );
}
