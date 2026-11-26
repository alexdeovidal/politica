# Gasto por morador
- Ano fechado de 2025: RREO Anexo 02 (6º bimestre), despesas liquidadas sem intraorçamentárias / população estimada IBGE de 01/07/2025.
- As funções e todos os totais são independentes de SIOPE, com diferenças preservadas. Casos sem valor confiável ficam fora do ranking.
- A parcela estadual de uma cidade é um rateio, não execução localizada. A composição municipal de idades de 2022 é ajustada à estimativa de 2025 sem mudar o total.
- A simulação particular só calcula uma diferença líquida com despesa anual evitável, custos adicionais, alunos da mesma etapa e preço por aluno informados.

## Coleta e reprodução
Use Python 3 no Linux. Os dois arquivos gzip de produção são instantâneos em `data/per-capita`.
`python scripts/per-capita/national.py POP2025_20260828.ods /tmp/cache-2025 --output /tmp/national-2025.json` valida e guarda cada resposta. Para apenas recombinar o cache, acrescente `--export-only`.
`python scripts/per-capita/ages.py /tmp/sidra-9514.json /tmp/age-2022.json` valida as 7 categorias do IBGE por município. A URL está em `ages.py`.
Use `gzip -n -9 -c` para empacotar cada JSON.

Em produção, uma tarefa limitada usa o mesmo volume das contas municipais, mas escreve em um subdiretório separado e só troca o resultado após fechar um lote:
```sh
D="${MUNICIPAL_REFRESH_DIR:-/data/municipal-accounts-refresh}"
python3 scripts/per-capita/national.py /dev/null "$D/per-capita-cache" --live --limit 240 --output "$D/per-capita-2025-extra.json"
```
A tarefa usa um bloqueio exclusivo, limita o tráfego da API e retenta falhas depois de 24 horas. O site mantém a última coleta íntegra e também aproveita os demonstrativos de 2025 já validados pelo coletor municipal existente.
