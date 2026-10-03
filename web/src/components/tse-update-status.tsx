import { CalendarClock, RefreshCw } from "lucide-react";
import type { TseUpdateStatus as Status } from "@/lib/tse-update-status";

function formatBrasiliaDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value)).replace(",", " às");
}

export function TseUpdateStatus({ status }: { status: Status }) {
  const updatedAt = formatBrasiliaDate(status.lastUpdatedAt);

  return (
    <section className="tse-update-status" aria-label="Atualização dos dados do TSE">
      <div className="tse-update-status__item tse-update-status__item--updated">
        <div className="tse-update-status__label">
          <CalendarClock size={15} aria-hidden="true" />
          Última atualização dos dados do TSE
        </div>
        {updatedAt ? (
          <time className="tse-update-status__value" dateTime={status.lastUpdatedAt ?? undefined}>
            {updatedAt}
          </time>
        ) : (
          <strong className="tse-update-status__value">Data não disponível</strong>
        )}
        <span className="tse-update-status__detail">Horário de Brasília · dados dos conjuntos monitorados</span>
      </div>

      <div className="tse-update-status__item">
        <div className="tse-update-status__label">
          <RefreshCw size={14} aria-hidden="true" />
          Frequência de verificação
        </div>
        <strong className="tse-update-status__value">A cada {status.checkIntervalHours} horas</strong>
        <span className="tse-update-status__detail">
          Novos arquivos são sincronizados quando o TSE publica alterações.
        </span>
        <span className="tse-update-status__scope">
          Monitoramento de candidaturas, contas, bens e redes sociais de 2026.
        </span>
      </div>
    </section>
  );
}
