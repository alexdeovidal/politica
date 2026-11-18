import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsPreferencesButton } from "@/components/analytics";

export const metadata: Metadata = {
  title: "Privacidade e medição de acesso | Politica007",
  description: "Como funciona a medição opcional de acesso do Politica007 e como alterar sua preferência de cookies de análise.",
  alternates: { canonical: "https://politica007.com.br/privacidade" },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-8 py-6">
      <header className="space-y-3">
        <p className="mono-label">POLITICA007</p>
        <h1 className="text-3xl font-semibold tracking-tight">Privacidade e medição de acesso</h1>
        <p className="text-sm leading-7 text-muted-foreground">Esta página explica a medição de uso do portal e a escolha disponível no botão “Cookies de análise”.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Google Analytics é opcional</h2>
        <p className="text-sm leading-7">A tag do Google Analytics só é carregada depois de você aceitar. Essa medição ajuda a entender quais seções são visitadas, de onde vêm os acessos e como o portal é usado em diferentes dispositivos. O portal continua funcionando se você recusar.</p>
        <p className="text-sm leading-7">A integração envia nomes genéricos de seções. Perfis de pessoas e empresas, matérias e contratos são agrupados. Termos digitados, CPF, CNPJ, nomes de pessoas, filtros de consulta e títulos individuais de perfis não são enviados por essa integração. Recursos de publicidade e sinais do Google estão desativados nesta configuração.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Sua escolha neste navegador</h2>
        <p className="text-sm leading-7">A preferência é guardada no armazenamento local do navegador. Quando permitidos, os cookies de análise usam o prefixo “politica007” e têm validade configurada de até 180 dias. Se o navegador bloquear o armazenamento, a escolha vale somente enquanto esta página estiver aberta.</p>
        <p className="text-sm leading-7">Você pode retirar o consentimento no botão abaixo ou em “Cookies de análise”. Isso interrompe novos envios ao Google Analytics e remove os cookies dessa integração acessíveis ao portal neste navegador. A retirada não apaga automaticamente dados que já tenham sido enviados.</p>
        <AnalyticsPreferencesButton />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Funcionamento e infraestrutura</h2>
        <p className="text-sm leading-7">O portal também usa serviços da Cloudflare para infraestrutura, segurança e estatísticas técnicas, além de métricas operacionais próprias. A preferência descrita nesta página controla o Google Analytics; ela não altera esses serviços nem o armazenamento de funcionalidades que você usa, como tema e consultas salvas.</p>
        <p className="text-sm leading-7">Os registros públicos consultados no portal têm suas fontes e limites descritos em <Link className="underline underline-offset-4" href="/fontes">Fontes e atualização</Link>.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Mais informações</h2>
        <p className="text-sm leading-7">Consulte também a <a className="underline underline-offset-4" href="https://policies.google.com/privacy?hl=pt-BR" rel="noreferrer">Política de Privacidade do Google</a> e as <a className="underline underline-offset-4" href="https://support.google.com/analytics/answer/6366371?hl=pt-BR" rel="noreferrer">orientações do Analytics sobre dados pessoais</a>.</p>
      </section>
    </article>
  );
}
