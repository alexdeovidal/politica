"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { GraphSearchResult, GraphNodeInfo, GraphEdge } from "@/lib/queries";
import { formatBRL } from "@/lib/format";

function Pick({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<GraphSearchResult[]>([]);

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/graph-search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { results: [] }))
        .then((data) => setRows(data.results || []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <label className="platform-form">
        {label}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome, CPF ou CNPJ"
        />
      </label>
      <p className="text-xs">Selecionado: {value || "nenhum"}</p>
      {query.length > 1 &&
        rows.map((row) => (
          <button
            className="btn my-1"
            key={row.cpfCnpj}
            onClick={() => {
              onChange(row.cpfCnpj);
              setQuery("");
              setRows([]);
            }}
          >
            {row.label} · {row.sublabel}
          </button>
        ))}
    </div>
  );
}

type Result = {
  found: boolean;
  nodes: GraphNodeInfo[];
  edges: GraphEdge[];
  visited: number;
  limited: boolean;
  coverage?: string;
};

const NO_PATH_RESULT: Result = {
  found: false,
  nodes: [],
  edges: [],
  visited: 0,
  limited: false,
  coverage:
    "A consulta não retornou vínculos entre estes registros. A ausência de um caminho não comprova ausência de relação fora dos dados e limites consultados.",
};

async function readPathResponse(response: Response): Promise<Result> {
  const body = await response.text();
  let data: unknown;

  if (body.trim()) {
    try {
      data = JSON.parse(body);
    } catch {
      if (!response.ok) {
        throw new Error("Não foi possível consultar os vínculos agora. Tente novamente.");
      }
      throw new Error("A resposta da consulta veio incompleta. Tente novamente.");
    }
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data &&
      typeof data.error === "string"
        ? data.error
        : response.status === 429
          ? "Aguarde um minuto para repetir a exploração."
          : "Não foi possível consultar os vínculos agora. Tente novamente.";
    throw new Error(message);
  }

  // A resposta vazia/204 representa ausência de vínculos; não tente fazer JSON.parse.
  if (response.status === 204 || !body.trim()) return NO_PATH_RESULT;

  if (typeof data !== "object" || data === null) {
    throw new Error("A resposta da consulta veio incompleta. Tente novamente.");
  }

  const result = data as Record<string, unknown>;
  if (typeof result.found !== "boolean" || !Array.isArray(result.nodes) || !Array.isArray(result.edges)) {
    throw new Error("A resposta da consulta veio incompleta. Tente novamente.");
  }

  return data as Result;
}

const LABEL: Record<string, string> = {
  donation: "Doação",
  payment: "Despesa contratada",
  ownership: "Participação societária",
  administration: "Administração",
  possibleidentity: "Possível identidade · não confirmada",
};

export function NetworkPath({
  initialA = "",
  initialB = "",
  initialYear = "",
  initialKind = "todos",
}: {
  initialA?: string;
  initialB?: string;
  initialYear?: string;
  initialKind?: string;
}) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [year, setYear] = useState(initialYear);
  const [kind, setKind] = useState(initialKind);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function find() {
    setBusy(true);
    setError("");
    setResult(null);
    const params = new URLSearchParams({ a, b, tipo: kind });
    if (year) params.set("ano", year);
    history.replaceState(null, "", `/conexoes?${params}`);

    try {
      const response = await fetch(`/api/network-path?${params}`);
      setResult(await readPathResponse(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar os vínculos agora.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="platform-grid">
        <Pick label="Primeira pessoa ou empresa" value={a} onChange={setA} />
        <Pick label="Segunda pessoa ou empresa" value={b} onChange={setB} />
      </div>
      <div className="platform-form">
        <label>
          Eleição · vínculos financeiros
          <input type="number" value={year} onChange={(event) => setYear(event.target.value)} placeholder="Todas" />
        </label>
        <label>
          Relações
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="todos">Todas</option>
            <option value="societario">Societárias e identidade</option>
            <option value="financeiro">Financeiras</option>
          </select>
        </label>
        <button className="btn" disabled={busy || !a || !b} onClick={find}>
          {busy ? "Explorando relações…" : "Encontrar caminho"}
        </button>
      </div>

      {error && <p role="alert">{error}</p>}
      {result && (
        <section id="caminho-encontrado" data-toc-title="Caminho entre registros">
          <h2>{result.found ? "Caminho encontrado nos registros coletados" : "Nenhum caminho encontrado nos limites desta consulta"}</h2>
          <p>
            {result.coverage ||
              `${result.visited} nós explorados. A busca mostra conexões entre registros, percorrendo relações nos dois sentidos; setas e valores mantêm a direção da fonte. ${result.limited ? "Algumas expansões atingiram o limite." : ""}`}
          </p>
          {result.nodes.map((node, index) => (
            <article className="card my-3" key={node.cpfCnpj}>
              <h3>
                {index + 1}.{" "}
                <Link
                  className="link-primary"
                  href={
                    node.cpfCnpj.startsWith("soc:")
                      ? `/socios/${node.cpfCnpj.slice(4)}`
                      : node.personId
                        ? `/politico/${node.personId}`
                        : `/${node.type === "company" ? "cnpj" : "cpf"}/${node.cpfCnpj}`
                  }
                >
                  {node.label}
                </Link>
              </h3>
              {result.edges[index] && (
                <p>
                  {LABEL[result.edges[index].kind]} · {result.edges[index].source} → {result.edges[index].target}
                  {["donation", "payment"].includes(result.edges[index].kind)
                    ? ` · ${formatBRL(result.edges[index].amountCents)}`
                    : ""}
                </p>
              )}
              {result.edges[index] && ["donation", "payment"].includes(result.edges[index].kind) && (
                <Link
                  className="source-link"
                  href={`/relacao?de=${result.edges[index].source}&para=${result.edges[index].target}&tipo=${result.edges[index].kind}${year ? `&ano=${year}` : ""}`}
                >
                  Registros e fontes da ligação financeira
                </Link>
              )}
              {result.edges[index]?.evidence && (
                <a className="source-link" href={result.edges[index].evidence!.url} target="_blank" rel="noopener noreferrer">
                  Fonte do vínculo societário
                </a>
              )}
            </article>
          ))}
          {result.found && (
            <Link className="btn" href={`/grafo?add=${result.nodes.map((node) => node.cpfCnpj).join(",")}${year ? `&ano=${year}` : ""}`}>
              Explorar este caminho no grafo
            </Link>
          )}
          <p className="text-sm my-3">
            Até quatro ligações, 160 nós e 40 relações por expansão. Relação societária é o retrato da coleta; o ano filtra somente registros financeiros. Possíveis identidades não comprovam que se trata da mesma pessoa. Uma conexão não demonstra irregularidade.
          </p>
        </section>
      )}
    </>
  );
}
