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
