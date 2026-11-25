# Contas municipais

Caldas Novas conserva o painel e a coleta preexistentes. A cobertura nova
usa uma entrada por município em `src/lib/municipal-registry.json`, com
IBGE oficial e, quando confirmado, CNPJ do órgão do PNCP. O PNCP de Goiânia
deste painel cobre somente 01.612.092/0001-23, identificado em publicação da
Prefeitura; fundos e demais CNPJs não são presumidos. A consulta por município
na rota testada não restringiu a resposta; a coleta usa CNPJ e valida órgão,
esfera, ID, janela e paginação. Valor publicado não significa pagamento.
A janela de 30 dias é móvel. O histórico fiscal é preservado por exercício.

O painel parte da versão validada em `data/municipal-accounts` e lê versões
mais recentes em /data/municipal-accounts-refresh. Rode o build antes de
executar a coleta; ele empacota o validador que a rotina chama antes de gravar.
A atualização preserva a outra fonte e a última versão boa em caso de erro.

No Coolify, em uma janela distinta da coleta estadual, executar diariamente:

```
cd /app && /bin/python3 scripts/municipal-accounts/refresh.py
```

Para habilitar o próximo município, confira a fonte e a identidade oficial,
colecione os dois arquivos em diretório isolado, teste as páginas, adicione
o snapshot inicial e publique. Antes de aumentar substancialmente o número
de cidades, separar processamento por janela de atualização ou fila limitada;
a coleta atual é serial e respeita no mínimo 1,1 segundo entre requisições.

## Expansão nacional

O catálogo IBGE inclui 5.569 municípios com prefeitura; Brasília e Fernando de
Noronha são exceções territoriais, não municípios. O seletor distingue
cadastro de cobertura publicada. A fila usa códigos do catálogo e libera cada
cidade somente depois de validar e gravar o RREO. Cidades sem atualização
seguem disponíveis com a última versão válida. Contratos são uma integração
independente e não são inferidos por município.

```sh
cd /app && /bin/python3 scripts/municipal-accounts/queue.py --limit 60 --seconds 780
```

O coletor roda sequencialmente com pausa mínima de 1,1 s entre requisições,
prioriza cidades sem painel e começa pelas capitais. Na primeira publicação,
valida os dois anexos mais recentes do exercício vigente. Se ainda não existirem,
usa o exercício anterior; se nenhum for válido, não publica. Nas revisitas,
completa o histórico e mantém o último bimestre válido por exercício. A fila
retoma de SQLite no volume; a revisão semanal depende da capacidade das fontes.
Falhas mantêm as versões anteriores, entram em espera crescente, e 429/503
interrompem o ciclo. Agende em uma janela que não conflite com as coletas
estaduais/municipais já existentes. O FINBRA público tem exportação em lote,
mas durante a checagem exigiu hCaptcha; esta fila não contorna o controle.
