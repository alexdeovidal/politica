# Goiás: fontes documentais de publicidade

Os adaptadores usam somente fontes públicas oficiais e operações de leitura. Eles não acessam sessões de navegador, não usam credenciais e não alteram os portais consultados. As fontes são complementares à execução financeira da Secretaria da Economia: **não somar as planilhas a ordens de pagamento sem conciliar a sobreposição**.

## Executar

Use Python 3.12 e instale as dependências de `advertising-requirements.txt` em um ambiente separado da aplicação. Os dados brutos devem ficar fora do repositório.

```bash
python3 -m pip install -r web/scripts/state-accounts/sources/advertising-requirements.txt
python3 web/scripts/state-accounts/sources/collect-advertising-goias.py \
  --cache /tmp/politica007-go-publicidade \
  --output /tmp/politica007-go-publicidade-normalizada \
  --retrieved-at 2026-11-18 \
  --refresh
```

Para reproduzir uma coleta já preservada, substitua `--refresh` por `--offline` e informe a data real daquela coleta. O modo offline exige os arquivos brutos e a exportação SANEAGO existentes. Sem `--refresh`, arquivos de cache existentes são reutilizados; para atualização efetiva use a opção. Confira novas publicações e vínculos oficiais antes de estender o período: a planilha Goiás Parcerias e as planilhas anuais DETRAN têm versões/endereço explicitamente registrados no coletor.

Os normalizadores também aceitam `--cache` e `--retrieved-at` diretamente. As rotinas podem gerar dados que exigem revisão; publicação não é automática.

## Produtos e critérios

| Arquivo | Fonte e interpretação |
| --- | --- |
| `advertising-records.ndjson` | SECOM e DETRAN: uma nota por linha, com agência, veículo, campanha quando disponível, empenho, valores, datas, situação e linha/aba de origem. |
| `advertising-summary.json` | Totais por data de pagamento e órgão, hashes e verificações de qualidade. Não representa o consolidado estadual. |
| `saneago-advertising.json` | Tabela pública Qlik da SANEAGO: pagamento, fornecedor, veículo, finalidade, meio e valor. Classificação legal/institucional é a da própria fonte. |
| `legal-advertising.json` | CEASA e Goiás Parcerias, preservando a diferença entre pagamento confirmado e despesa informada por mês. |
| `fomento-telecom-advertising.json` | GoiásFomento e histórico GoiásTelecom. A versão atual do CSV Fomento substitui os snapshots mensais cumulativos. |
| `advertising-download-manifest.json` | URL oficial, tamanho e SHA-256 de cada arquivo baixado. |

### Valores e datas

- Valores normalizados são inteiros em centavos de real. As datas representam o pagamento quando a fonte identifica esse campo. O ano da aba, do empenho e da competência não substitui a data de pagamento.
- Na SECOM e no DETRAN, **o bruto da agência já inclui veículo e comissão**. Esses campos são componentes para conferência, não despesas a somar.
- `paidInvoiceGrossCents` é o bruto das notas com pagamento do líquido datado. `paidNetCents` é o líquido, excluindo retenções. Nenhum desses totais substitui a soma de ordens de pagamento do Tesouro.
- Líquidos maiores que o bruto são preservados como evidência, sinalizados e excluídos da soma líquida. Datas inválidas ou posteriores à coleta ficam fora dos totais pagos. Os dados originais não são corrigidos por suposição.
- SECOM usa apenas abas anuais de registros. Abas de resumo, cadastro e colunas vinculadas são excluídas. A chave de deduplicação inclui órgão, empenho, agência, notas, veículo, valor bruto e data.
- SANEAGO: exportação do objeto público `DtBJTP` pelo método Qlik `GetHyperCubeData`, em páginas de até 7.000 células. A coleta também lê os totais oficiais por finalidade/meio. Valores apresentados por linha são arredondados pela fonte; o valor numérico original e a diferença para o total oficial são preservados.
- CEASA: soma das linhas é conciliada ao total publicado no próprio HTML. Links de planilha que são placeholders não são usados.
- GoiásFomento: retenções tributárias em linhas próprias são identificadas; não são receita de veículo. GoiásTelecom e Goiás Parcerias, sem fase explicitada, ficam como `reported_expense`.

## Cobertura e manutenção

Ausência de registro não prova despesa zero. A última data disponível varia por órgão. Publicidade legal, institucional, monitoramento/clipping, patrocínio e serviços mistos devem ser classificados separadamente. Nenhum adaptador converte valores em quantidades de cirurgias nem presume irregularidade.

A estrutura de fonte, UF, órgão, estágio, período, proveniência e qualidade permite novos adaptadores por estado. Cada UF exige registro das fontes e validação de seu próprio esquema; não existe uma API única nacional para estas despesas.
