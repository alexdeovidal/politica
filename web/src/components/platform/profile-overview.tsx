import { getPersonCandidacies, getPersonAssets } from "@/lib/queries";
import { formatBRL } from "@/lib/format";

export function ProfileNavigation() {
  return (
    <nav className="platform-tabs" aria-label="Seções do perfil">
      {[["candidaturas", "Histórico"], ["votos-por-local", "Votos"], ["financas", "Finanças"], ["empresas-relacionadas", "Empresas"], ["processos-eleitorais", "Processos"], ["bens-declarados", "Patrimônio"], ["atividade-legislativa", "Atividade parlamentar"]].map(([id, label]) => (
        <a key={id} href={`#${id}`}>{label}</a>
      ))}
    </nav>
  );
}

export async function ProfileTimeline({ personId }: { personId: number }) {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const candidacies = getPersonCandidacies(personId);
  const assets = getPersonAssets(personId).declaredAssetsByYear;
  return (
    <details className="card my-4" id="linha-do-tempo" data-toc-title="Linha do tempo">
      <summary>Linha do tempo eleitoral e patrimonial</summary>
      <ol className="mt-4 flex flex-col gap-4">
        {candidacies.map((candidacy) => {
          const asset = assets.find((item) => item.year === candidacy.year);
          return (
            <li key={candidacy.id}>
              <strong>{candidacy.year} · {candidacy.office} · {candidacy.partyAbbr}/{candidacy.state}</strong>
              <p>{candidacy.result || "Resultado ainda não informado"} · {asset
                ? asset.missingValues === asset.count
                  ? "Patrimônio com valores não informados"
                  : `Patrimônio declarado: ${formatBRL(asset.totalCents)}${asset.missingValues ? " (soma dos valores informados)" : ""}`
                : "Patrimônio sem declaração coletada para esta eleição"}</p>
              <a className="source-link" href={candidacy.provenance.url} target="_blank" rel="noopener noreferrer">Arquivo oficial desta candidatura</a>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
