import { parentPort, workerData } from "node:worker_threads";
import { getGraphPaths, getGraphNodeNetwork, resolveGraphNode, getPersonVoteResults, getFinancePage, type GraphEdge } from "../src/lib/queries";

function run() {
  const d = workerData;
  if (d.mode === "graph-paths") return getGraphPaths(d.newId, d.existingIds, d.year);
  if (d.mode === "graph-expand") return getGraphNodeNetwork(d.cpfCnpj, d.limit, d.year, d.relation);
  if (d.mode === "graph-node") return { node: resolveGraphNode(d.cpfCnpj) };
  if (d.mode === "person-votes") return getPersonVoteResults(d.personId);
  if (d.mode === "finance-page") return getFinancePage(d.params);
  if (d.mode !== "network-path") throw new Error("Unknown query mode");
  const start = resolveGraphNode(d.a), end = resolveGraphNode(d.b);
  if (!start || !end) return { missing: true };
  const queue = [{ id: start.cpfCnpj, path: [] as GraphEdge[], ids: [start.cpfCnpj] }];
  const seen = new Set<string>(), nodes = new Map([[start.cpfCnpj, start], [end.cpfCnpj, end]]);
  const began = Date.now();
  let limited = false;
  while (queue.length && seen.size < 160 && Date.now() - began < 7000) {
    const current = queue.shift()!;
    if (current.id === end.cpfCnpj) return { found: true, nodes: current.ids.map(id => nodes.get(id)), edges: current.path, visited: seen.size, limited, year: d.year };
    if (current.path.length >= 4 || seen.has(current.id)) continue;
    seen.add(current.id);
    const network = getGraphNodeNetwork(current.id, 40, d.year, d.kind);
    if (network.truncated) limited = true;
    for (const node of network.nodes) nodes.set(node.cpfCnpj, node);
    for (const edge of network.edges) {
      const financial = ["donation", "payment"].includes(edge.kind);
      if ((d.kind === "societario" && financial) || (d.kind === "financeiro" && !financial)) continue;
      const next = edge.source === current.id ? edge.target : edge.source;
      if (!seen.has(next) && !current.ids.includes(next)) queue.push({ id: next, path: [...current.path, edge], ids: [...current.ids, next] });
    }
  }
  return { found: false, nodes: [], edges: [], visited: seen.size, limited: limited || queue.length > 0, coverage: "Busca em até 4 ligações, 160 nós e 40 relações por expansão. Não encontrar um caminho não comprova ausência de relação." };
}

try { parentPort!.postMessage(run()); }
catch (error) { parentPort!.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
