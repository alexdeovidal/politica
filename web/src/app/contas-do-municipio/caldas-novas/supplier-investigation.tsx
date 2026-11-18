import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { kinshipLabels, municipalPath, supplierInvestigationSignals, supplierProfile, type KinshipEvidence, type MunicipalContract } from "@/lib/municipal-accounts";

const date = (value: string | null | undefined) => value ? value.slice(0, 10).split("-").reverse().join("/") : "Não informada";
const contractHref = (id: string) => `${municipalPath}/${id.replace("/", "-")}#quadro-societario`;

function Kinship({ row }: { row: KinshipEvidence }) {
  return <div>
    <strong>{kinshipLabels[row.relationship]}</strong>
    <p>{row.partner} · {row.official} ({row.office})</p>
    <p className="my-1 text-[var(--muted)]">{row.evidence}</p>
    <a href={row.source_url} className="source-link">Documento oficial · {date(row.document_date)}</a>
  </div>;
}

export function SupplierInvestigationSignals() {
  const signals = supplierInvestigationSignals();
  return <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
    <section className="rounded-lg border border-[var(--border-1)] p-4">
      <h3 className="font-semibold">Alterações no quadro societário</h3>
      <p className="my-2 text-[var(--muted)]">Compara versões coletadas do mesmo CNPJ. A data de observação registra quando a diferença apareceu na base.</p>
      {signals?.versions.length ? <ul className="grid gap-3">
        {signals.versions.map(row => <li key={row.cnpj}>
          <Link prefetch={false} className="source-link" href={contractHref(row.contractId)}>{row.supplier ?? row.cnpj}</Link>
          <p>Alteração observada em {date(row.observed)}</p>
        </li>)}
      </ul> : <p>Nenhuma mudança de quadro registrada nas versões comparáveis até agora.</p>}
    </section>
    <section className="rounded-lg border border-[var(--border-1)] p-4">
      <h3 className="font-semibold">Parentesco documentado</h3>
      <p className="my-2 text-[var(--muted)]">A revisão considera quem participou da contratação e quando. A publicação de um vínculo exige evidência oficial conferida.</p>
      {signals?.kinship.length ? <ul className="grid gap-3">
        {signals.kinship.map((row, index) => <li key={index}>
          <Kinship row={row} />
          <Link className="source-link ml-3" prefetch={false} href={contractHref(row.contract_id)}>Ver contrato</Link>
        </li>)}
      </ul> : <p>Nenhum caso com evidência documental publicada no acervo atual.</p>}
    </section>
  </div>;
}

export function SupplierInvestigation({ contract }: { contract: MunicipalContract }) {
  const cnpj = contract.supplier_cnpj;
  if (!cnpj) return null;
  const profile = supplierProfile(cnpj, contract.id);
  const versions = profile?.versions ?? [];
  const current = versions[0]?.registration;
  const signature = contract.signed ? Date.parse(contract.signed) : NaN;
  const closeToSignature = (entry: string | null) => {
    if (!entry || !Number.isFinite(signature)) return false;
    return Math.abs(Date.parse(entry) - signature) <= 90 * 86400_000;
  };

  return <section id="quadro-societario" className="card scroll-mt-20 p-5">
    <h2 className="text-lg font-semibold">Quadro societário e histórico do fornecedor</h2>
    <p className="mt-2 text-sm text-[var(--muted)]">CNPJ {cnpj} · {profile?.checked ? `Consulta mais recente em ${date(profile.checked)}` : "Aguardando consulta cadastral"}</p>
    {current && <>
      <p className="mt-2 text-sm">{current.name} · {[current.status, current.nature, current.city, current.state].filter(Boolean).join(" · ")}</p>
      <p className="mt-1 text-sm">Capital social informado: {current.capital === null ? "Não informado" : formatBRL(current.capital)}</p>
      {current.partners.length ? <ul className="my-4 grid gap-2 sm:grid-cols-2">
        {current.partners.map((person, index) => <li key={`${person.key}-${index}`} className="rounded-lg border border-[var(--border-1)] p-3 text-sm">
          <strong>{person.corporate ? <Link prefetch={false} className="source-link" href={`/cnpj/${person.corporate}`}>{person.name}</Link> : person.name}</strong>
          <p>{person.role ?? "Qualificação não informada"} · Entrada informada: {date(person.entry)}</p>
          {closeToSignature(person.entry) && <p className="mt-2 font-medium">Entrada informada a até 90 dias da assinatura. Confira o ato societário e o processo de contratação.</p>}
        </li>)}
      </ul> : <p className="my-3 text-sm">A consulta cadastral retornou um quadro sem integrantes.</p>}
    </>}
    <div className="mt-3 flex flex-wrap gap-4 text-sm">
      <a className="source-link" href={`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`}>Cadastro consultado · BrasilAPI</a>
      <a className="source-link" href="https://servicos.juceg.go.gov.br/consulta-publica/">Conferir atos na JUCEG (empresas de Goiás)</a>
    </div>
    <h3 className="mt-5 font-semibold">Mudanças observadas</h3>
    <p className="my-2 text-sm text-[var(--muted)]">A comparação começa na primeira consulta salva. Entradas e ausências observadas devem ser conferidas com os atos registrados na Junta Comercial.</p>
    {versions.length < 2 ? <p className="text-sm">Ainda não há duas versões diferentes para comparar.</p> :
      <ul className="grid gap-3 text-sm">{versions.slice(0, -1).map((version, index) => {
        const previous = versions[index + 1];
        const old = previous.registration, next = version.registration;
        const prior = new Map(old.partners.map(row => [row.key, row]));
        const latest = new Map(next.partners.map(row => [row.key, row]));
        const changes = [
          ...next.partners.filter(row => !prior.has(row.key)).map(row => `Passou a constar no quadro: ${row.name}`),
          ...old.partners.filter(row => !latest.has(row.key)).map(row => `Deixou de constar no quadro: ${row.name}`),
          ...next.partners.filter(row => prior.has(row.key) && (prior.get(row.key)?.role !== row.role || prior.get(row.key)?.entry !== row.entry))
            .map(row => `${row.name}: ${prior.get(row.key)?.role ?? "qualificação não informada"} (${date(prior.get(row.key)?.entry)}) → ${row.role ?? "qualificação não informada"} (${date(row.entry)})`),
          ...([
            ["Razão social", old.name, next.name], ["Nome fantasia", old.tradeName, next.tradeName],
            ["Situação cadastral", old.status, next.status], ["Data da situação cadastral", old.statusDate, next.statusDate],
            ["Natureza jurídica", old.nature, next.nature], ["Município", old.city, next.city], ["UF", old.state, next.state],
            ["Capital social", old.capital === null ? null : formatBRL(old.capital), next.capital === null ? null : formatBRL(next.capital)],
          ] as const).filter(([, before, after]) => before !== after)
            .map(([label, before, after]) => `${label}: ${before ?? "sem dado"} → ${after ?? "sem dado"}`),
        ];
        return <li key={version.observed} className="rounded-lg border border-[var(--border-1)] p-3">
          <strong>Diferenças nas consultas de {date(previous.observed)} e {date(version.observed)}</strong>
          <ul className="mt-1 list-disc pl-5">{changes.map((change, i) => <li key={i}>{change}</li>)}</ul>
        </li>;
      })}</ul>}
    <h3 className="mt-5 font-semibold">Parentesco relacionado ao contrato</h3>
    {profile?.kinship.length ? <div className="my-2 text-sm">{profile.kinship.map((row, index) => <Kinship key={index} row={row} />)}</div> :
      <p className="my-2 text-sm">Nenhum vínculo documental publicado para este contrato. A cobertura depende dos documentos disponíveis para revisão.</p>}
    <a className="source-link text-sm" href="https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm#art14">Consultar o art. 14 da Lei de Licitações</a>
  </section>;
}
