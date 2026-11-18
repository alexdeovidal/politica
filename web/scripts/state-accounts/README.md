# Contas dos estados

O módulo mantém a apresentação e as regras financeiras compartilhadas entre
estados, com adaptadores e revisões próprios para cada fonte. A primeira
integração é Goiás, em `/contas-do-estado/goias`. O cadastro contém 27 UFs; somente
as integrações ativas resolvem páginas/API e entram no sitemap.

## O que esta versão publica

| Base | Evidência | Uso no painel |
| --- | --- | --- |
| Tesouro estadual | Ordens de pagamento e objetos dos empenhos da Secretaria da Economia | Publicidade institucional/legal e desembolsos identificados com destinação cirúrgica |
| Agências e veículos | Planilhas oficiais SECOM e DETRAN | Notas, veículos, campanhas, meios, bruto e líquido, sem soma adicional ao Tesouro |
| Empresas estaduais | SANEAGO, CEASA e GoiásFomento | Pagamentos empresariais apresentados em universo separado |
| PCE | Extratos de repasses pagos da SES | Detalhamento por município; as parcelas conciliadas com OPs não aumentam o total |
| Cirurgias | CSV de indicadores SES, RAG e produção SUS360 | Contagens e produção financeira com escopos e períodos próprios |
| Orçamento | Siconfi/RREO, anexos 01 e 02 | Comparação entre funções por dotação, empenhado e liquidado |

As fontes, datas reais, arquivos e hashes ficam em `summary.json`. Os registros
completos estão em `records.json.gz`, lidos somente no servidor. `audit.json`
preserva decisões de classificação/exclusão e o SHA-256 do JSON descomprimido.
A API verifica a integridade e recusa uma base inconsistente, em vez de servir
um total potencialmente incorreto.

A coleta de 18/11/2026 cobre a execução financeira de 2025 e janeiro a outubro
de 2026. Planilhas empresariais, notas e indicadores têm datas próprias. O RREO
de 2026 disponível nesta coleta vai até o 4º bimestre. Os filtros e rótulos
explicitam essas diferenças; a data de coleta não estende a cobertura da fonte.

**Limite essencial:** estes são valores temáticos identificados e revisados. Não
há certificação de toda a publicidade do Estado nem do custo integral de todas
as cirurgias da rede. A função Saúde inteira não substitui a despesa cirúrgica,
e a função Comunicações não é o total estadual de publicidade.

## Regras de comparação

- Valores são inteiros em centavos; estornos conservam o sinal.
- O período financeiro usa a data do pagamento. Competência e ano do empenho
  não substituem essa data.
- Cada base mantém sua etapa e seu universo. Tesouro, empresas, notas e produção
  financeira não são empilhados em um total artificial.
- Agência, veículo e comissão podem ser componentes da mesma nota. Não somar
  esses componentes ao bruto nem novamente às ordens do Tesouro.
- Transferência para município ou prestador é desembolso identificado do órgão;
  não demonstra o custo final de cada procedimento executado.
- Contratos de gestão hospitalar, objetos mistos e simples menções a rubricas
  cirúrgicas ficam fora do total estrito quando não há destinação comprovada.
- Ausência de registro é indisponibilidade. Um registro com zero continua zero.
  Razões exigem valores conhecidos, numerador não negativo e denominador
  positivo; o rótulo mantém o caráter parcial do recorte.
- O Anexo 02 do RREO não fornece pago por função. Essas células continuam
  `null`; o pago total do Anexo 01 não é rateado entre as funções.
- Não há cálculo de “quantas cirurgias poderiam ser feitas” ou custo médio a
  partir de fontes com escopos incompatíveis.

## Coleta e revisão

Os coletores são ferramentas de leitura de dados públicos. Execute-os em um
ambiente de trabalho separado, mantendo os arquivos brutos fora do repositório.
Não rode coletas durante a renderização do site ou durante o build. O snapshot
versionado permite que a publicação continue funcionando quando uma fonte fica
fora do ar.

Os comandos a seguir são executados a partir da raiz do repositório. Os caminhos
em `/tmp` são exemplos de diretório de trabalho, e a data deve ser a data real
da coleta.

### Publicidade

```bash
python3 -m pip install -r web/scripts/state-accounts/sources/advertising-requirements.txt
python3 web/scripts/state-accounts/sources/collect-advertising-goias.py \
  --cache /tmp/politica007-go/publicidade \
  --output /tmp/politica007-go/publicidade \
  --retrieved-at 2026-11-18 --refresh
```

Consulte [sources/README-advertising.md](sources/README-advertising.md) para a
interpretação de cada adaptador e reprodução offline. Os endereços de planilhas
publicadas devem ser conferidos quando a fonte muda de versão.

### Indicadores, repasses e orçamento

```bash
python3 web/scripts/state-accounts/sources/health-fetch-indicators.py \
  --cache /tmp/politica007-go/cirurgias
python3 web/scripts/state-accounts/sources/health-normalize-indicators.py \
  --cache /tmp/politica007-go/cirurgias --output-dir /tmp/politica007-go/cirurgias
python3 web/scripts/state-accounts/sources/health-fetch-pce-transfers.py \
  --cache /tmp/politica007-go/cirurgias --years 2021,2022,2023,2024,2025,2026
python3 web/scripts/state-accounts/sources/health-normalize-pce-transfers.py \
  --cache /tmp/politica007-go/cirurgias \
  --output /tmp/politica007-go/cirurgias/pce-repasses-pagos-normalizados.json \
  --years 2021,2022,2023,2024,2025,2026
python3 web/scripts/state-accounts/sources/fiscal-goias.py \
  --output /tmp/politica007-go/fiscal --years 2025 2026 --as-of 2026-11-18
```

O adaptador de indicadores usa as referências SUS360 explicitamente revisadas;
não interpreta uma competência nova sem conferir o período declarado na
resposta. A análise do RAG é documental. Uma divergência de contagem entre RAG e
CSV não é corrigida por estimativa.

A consulta PCE seleciona o ano da competência. Há parcelas de 2024 pagas em
2025; consultar somente a competência 2025 excluiria esses desembolsos.

### Pagamentos e classificação documental

```bash
python3 web/scripts/state-accounts/collect-goias-payments.py \
  --cache /tmp/politica007-go/central \
  --agency-ledger /tmp/politica007-go/publicidade/advertising-records.ndjson \
  --output /tmp/politica007-go/central/normalized-payments-expanded.json \
  --retrieved-at 2026-11-18 --years 2025,2026
```

Antes desta etapa, preserve no diretório `central` o catálogo e os arquivos
oficiais de empenhos usados na revisão (`empenhos-package.json`,
`empenhos-2025.zip`, `empenhos-AAAAMM.csv`). A origem é o [catálogo oficial de
empenhos](https://dadosabertos.go.gov.br/dataset/empenhos). O coletor reutiliza
arquivos presentes no cache; uma nova coleta exige atualizar o catálogo e os
arquivos deliberadamente, com nova data e hashes. Não altere a data de uma cópia
antiga para apresentá-la como coleta recente.

Uma identidade oficial de OP repetida com data ou valor conflitante interrompe
a extração. Novos candidatos cirúrgicos exigem revisão documental. A busca por
termos e o vínculo de empenho selecionam candidatos; não provam, sozinhos, que
todo o valor pertence à categoria.

O gerador consome as saídas normalizadas e os catálogos revisados de publicidade
e cirurgias. `audit.json` preserva as decisões da versão publicada. Ao atualizar,
conciliar novos candidatos com os documentos de origem e manter explícitas as
exclusões. Não substitua uma revisão por uma lista vazia.

```bash
python3 web/scripts/state-accounts/sources/health-review-surgery.py \
  --input /tmp/politica007-go/central/normalized-payments-expanded.json \
  --output /tmp/politica007-go/cirurgias/auditoria-cirurgias-central.json
```

O catálogo `sources/health-surgery-review.json` vincula cada decisão à identidade
e ao hash da evidência revisada. Documentos novos ou alterados interrompem essa
etapa até nova revisão. O gerador também confere o hash dos candidatos contra a
auditoria. Na ausência do catálogo intermediário de publicidade, utiliza as
decisões da versão publicada em `audit.json`, mantendo a mesma classificação.

## Gerar e verificar uma versão

```bash
python3 web/scripts/state-accounts/build-goias-snapshot.py \
  --research /tmp/politica007-go \
  --output web/data/state-accounts/goias
cd web
node scripts/test-state-accounts.cjs
node scripts/test-state-snapshot.cjs
npm run build
```

Os testes conferem fases, períodos, centavos, estornos, nulidade, deduplicação,
identidades de fonte, conciliação do RREO, sobreposição PCE/Tesouro, integridade
do snapshot e comportamento dos filtros/API. Os arquivos revisados devem ser
publicados juntos no mesmo commit. A aplicação mantém o snapshot em memória
por processo; uma nova versão exige build e implantação.

A implantação segue o repositório `alexdeovidal/politica`, branch `main`, base
`/web`, no Coolify. Esta integração não muda o banco eleitoral, o domínio nem as
rotinas municipais existentes. Não há agendamento automático estadual nesta
versão; a atualização depende de coleta, revisão, testes e nova publicação.

## Integrar outra UF

1. Criar adaptadores oficiais próprios para o estado e documentar códigos,
   órgãos, períodos, fases e regras de classificação.
2. Produzir `data/state-accounts/<slug>/summary.json`, `records.json.gz` e
   `audit.json` no contrato de `src/lib/state-accounts/dashboard-model.ts`.
3. Validar identidade da UF, fontes, hashes, valores em centavos, cobertura e
   conciliação. Disponibilizar somente dados que tenham proveniência conferida.
4. Ativar a UF em `src/lib/state-accounts/registry.ts`. A seleção nacional,
   páginas, API, sitemap e lista permitida de Analytics usam esse registro.
5. Executar as verificações e conferir o painel, os filtros e a exportação antes
   de publicar.

O novo estado não precisa de uma cópia do componente de Goiás. Particularidades
das fontes continuam nos adaptadores e no manifesto; acrescentar uma UF ao
cadastro sem integrar evidências não a torna disponível.
