import Link from "next/link";
import Form from "next/form";
import { PageHeader } from "@/components/shell/shell-context";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { formatBRL } from "@/lib/format";
import { concentrationSignals, listMunicipalContracts, municipalFiscalReports, municipalOrgs, municipalPath, repeatedContractSignals } from "@/lib/municipal-accounts";
import { MunicipalDashboard } from "./painel";
import { SearchCheck } from "lucide-react";
import styles from "./painel.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas do Município · Caldas Novas | Politica007" };

function money(value: string) {
  if (!/^\d{1,12}([.,]\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value.replace(",", ".")) * 100);
}
const displayDate = (value: string) => value.slice(0, 10).split("-").reverse().join("/");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

export default async function MunicipalAccounts({ searchParams }: PageProps<"/contas-do-municipio/caldas-novas">) {
  const params = await searchParams;
  const input = (key: string) => typeof params[key] === "string" ? params[key].trim().slice(0, 160) : "";
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(input(key)) ? input(key) : "";
  const org = Object.hasOwn(municipalOrgs, input("org")) ? input("org") : "";
  const q = input("q"), from = date("de"), to = date("ate");
  const unit = input("unidade");
  const minInput = input("min"), maxInput = input("max");
  const min = money(minInput), max = money(maxInput);
  const page = /^\d{1,5}$/.test(input("pagina")) ? Math.max(1, Number(input("pagina"))) : 1;
  const invalid = Boolean((from && to && from > to) || (minInput && min === null) ||
    (maxInput && max === null) || (min !== null && max !== null && min > max));
  const result = invalid ? null : listMunicipalContracts({ q, org, unit, from, to, min, max, page });
  const fiscal = municipalFiscalReports();
  const signals = result ? concentrationSignals() : [];
  const repeats = result ? repeatedContractSignals() : [];
  const hrefFor = (p: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ q, org, unidade: unit, de: from, ate: to, min: minInput, max: maxInput })) {
      if (value) next.set(key, value);
    }
    if (p > 1) next.set("pagina", String(p));
    return next.size ? `${municipalPath}?${next}` : municipalPath;
  };

  return <div className="flex flex-col gap-6">
    <PageHeader group="Contas do Município" current="Caldas Novas" />
    <MunicipalDashboard reports={fiscal} groups={result?.groups ?? []} labels={municipalOrgs} path={municipalPath}
      resultCount={result?.total ?? 0} scope={q || org || unit || from || to || min !== null || max !== null ? "Filtros da busca" : "Todo o acervo coletado"}
      filterParams={{ de: from, ate: to, min: minInput, max: maxInput }} />

    {result && <section id="sinais" className="card scroll-mt-20 p-4 sm:p-6">
      <div className={styles.sectionHead}>
        <div><h2 className="flex items-center gap-2"><SearchCheck size={21} /> Sinais para investigar</h2>
          <p>Triagem automática do acervo municipal coletado. Examine os documentos e o contexto antes de concluir sobre uma irregularidade.</p>
        </div>
      </div>
      <div className={styles.split}>
        <div>
          <h3>Concentração de contratos</h3>
          <p className="my-2 text-xs text-[var(--muted)]">Um fornecedor soma pelo menos 50% do valor dos contratos iniciais positivos do mesmo órgão e ano. A amostra exige ao menos cinco contratos e três CNPJs.</p>
          {signals.length === 0 ? <p className="text-sm">Nenhum caso atingiu a regra no acervo atual.</p> : <ul className="grid gap-3">
            {signals.map(s => <li key={`${s.org}-${s.year}-${s.cnpj}`} className="rounded-lg border border-[var(--border-1)] p-3 text-sm">
              <strong>{s.supplier ?? s.cnpj}</strong>
              <p className="mt-1 text-[var(--muted)]">{municipalOrgs[s.org]} · {s.year} · {s.contracts} de {s.sample} contratos</p>
              <p className="my-2">{percent.format(s.share)} do valor da amostra. {formatBRL(s.amount)} de {formatBRL(s.total)}.</p>
              <Link className="source-link" prefetch={false} href={`${municipalPath}?q=${s.cnpj}&org=${s.org}&de=${s.year}-01-01&ate=${s.year}-12-31#buscar-contratos`}>Ver registros do fornecedor</Link>
            </li>)}
          </ul>}
        </div>
        <div>
          <h3>Contratos com objeto e valor iguais</h3>
          <p className="my-2 text-xs text-[var(--muted)]">Contratos iniciais de números diferentes para o mesmo órgão, unidade e CNPJ, com descrição e valor iguais e publicação em até 30 dias. Confira se os itens, períodos ou entregas são distintos.</p>
          {repeats.length === 0 ? <p className="text-sm">Nenhum par atingiu a regra no acervo atual.</p> : <ul className="grid gap-3">
            {repeats.map(row => <li key={row.id} className="rounded-lg border border-[var(--border-1)] p-3 text-sm">
              <strong>{row.supplier ?? row.supplier_cnpj}</strong> · {formatBRL(row.amount_cents)} por contrato
              <p className="my-2 text-[var(--muted)] line-clamp-2">{row.title}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {[{ id: row.previousId, number: row.previousNumber, day: row.previousDate }, { id: row.id, number: row.number, day: row.published }].map(item =>
                  <Link className="source-link" key={item.id} prefetch={false} href={`${municipalPath}/${item.id.replace("/", "-")}`}>
                    {item.number} · {displayDate(item.day)}
                  </Link>)}
              </div>
            </li>)}
          </ul>}
        </div>
      </div>
    </section>}

    <section id="buscar-contratos" className="card scroll-mt-20 p-4 sm:p-6">
      <h2 className="section-title">Buscar contratos</h2>
      <Form action={municipalPath} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {unit && <label className="flex flex-col gap-2 text-sm sm:col-span-2">Unidade compradora
          <input className="input" name="unidade" defaultValue={unit} maxLength={160} />
        </label>}
        <label className="flex flex-col gap-2 text-sm sm:col-span-2">Objeto, fornecedor, CNPJ ou processo
          <input className="input" name="q" defaultValue={q} maxLength={160} placeholder="Ex.: merenda escolar" />
        </label>
        <label className="flex flex-col gap-2 text-sm sm:col-span-2">Órgão comprador
          <select className="input" name="org" defaultValue={org}>
            <option value="">Todos os órgãos do piloto</option>
            {Object.entries(municipalOrgs).map(([key, name]) => <option value={key} key={key}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">Publicado desde<input className="input" type="date" name="de" defaultValue={from} /></label>
        <label className="flex flex-col gap-2 text-sm">Publicado até<input className="input" type="date" name="ate" defaultValue={to} /></label>
        <label className="flex flex-col gap-2 text-sm">Valor mínimo (R$)<input className="input" name="min" inputMode="decimal" defaultValue={minInput} placeholder="Ex.: 1000,00" /></label>
        <label className="flex flex-col gap-2 text-sm">Valor máximo (R$)<input className="input" name="max" inputMode="decimal" defaultValue={maxInput} /></label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="btn btn--primary" type="submit">Buscar</button>
          <Link href={municipalPath} prefetch={false} className="btn">Limpar</Link>
        </div>
      </Form>
      {invalid && <p role="alert" className="mt-3">Confira as datas e os valores. O início da faixa deve ser menor ou igual ao fim.</p>}
    </section>

    {!invalid && !result && <p role="status">A base local aguarda a primeira coleta ou está temporariamente indisponível.</p>}
    {result && <>
      <section aria-label="Resultados dos contratos">
        <p className="mb-3 text-sm">{result.total.toLocaleString("pt-BR")} registros encontrados</p>
        {result.rows.length === 0 ? <p className="card p-4">Nenhum resultado nos dados coletados para estes filtros.</p> :
        <ul className="grid gap-3">
          {result.rows.map(row => <li key={row.id} className="card grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="text-sm" style={{ color: "var(--muted)" }}>{municipalOrgs[row.org]}{row.unit ? ` · ${row.unit}` : ""} · {displayDate(row.published)}</p>
              <Link className="mt-1 block font-medium hover:underline line-clamp-2" prefetch={false}
                href={`${municipalPath}/${row.id.replace("/", "-")}`}>{row.title}</Link>
              <p className="mt-2 text-sm">{row.supplier || "Fornecedor sem identificação empresarial exibida"}{row.supplier_cnpj ? ` · ${row.supplier_cnpj}` : ""}</p>
            </div>
            <p className="self-center text-sm sm:text-right"><span className="block font-semibold">{row.amount_cents === null ? "Não informado" : formatBRL(row.amount_cents)}</span> Valor global no PNCP</p>
          </li>)}
        </ul>}
        <PaginationLinks page={result.page} totalPages={result.totalPages} makeHref={hrefFor} prefetch={false} />
      </section>


    </>}

    <section className="card p-4 text-sm">
      <h2 className="mb-2 font-semibold">Fontes e cobertura</h2>
      <ul className="grid gap-1">
        {Object.entries(municipalOrgs).map(([key, name]) => {
          const item = result?.coverage.find(row => row.org === key);
          return <li key={key}>{name} · {item ? `${item.months} meses consultados no PNCP, de ${item.start.slice(0, 7)} a ${item.end.slice(0, 7)}. Última coleta bem-sucedida: ${displayDate(item.last)}.` : "coleta ainda não confirmada."}</li>;
        })}
      </ul>
      <p className="my-3">O número de meses consultados pode conter lacunas entre as datas exibidas. Empenhos, liquidações e pagamentos municipais aguardam integração de uma fonte que permita confirmar o vínculo por contrato.</p>
      <div className="flex flex-wrap gap-4">
        <a className="source-link" href="https://pncp.gov.br/app/contratos">PNCP</a>
        <a className="source-link" href="https://www.caldasnovas.go.gov.br/transparencia/">Portal da Prefeitura</a>
        <a className="source-link" href="https://portalcidadao.tcmgo.tc.br/new-portal-cidadao/pages/inicio.php">TCMGO</a>
        <Link className="source-link" href="/emendas?q=Caldas+Novas&destino=todos" prefetch={false}>Consultar emendas</Link>
      </div>
    </section>
  </div>;
}
