# Politica007 — portal independente de dados públicos

O Politica007, baseado no projeto Elosys, monta a partir de **fontes oficiais e públicas** uma base de dados
consolidada de candidatos e eleitos brasileiros (2014–2026), cruzada por CPF/CNPJ,
para investigar relações entre políticos e levantar **indícios** de padrões
suspeitos (doação circular, fracionamento de doações, empresas de fachada,
enriquecimento incompatível).

> **Indício não é prova.** Nada aqui é acusação. O sistema gera *sinais de alerta*
> para serem checados por quem tem competência para isso (Ministério Público, TCU,
> Receita, COAF). Todo dado exibido aponta para o arquivo público de onde saiu, e
> qualquer pessoa pode re-baixar esse arquivo e conferir o hash.

Backend: pipeline de coleta em Python + banco SQLite (`elosys.db`). Frontend:
app Next.js em [`/web`](web/README.md) — lê a base eleitoral e mostra a
ficha completa com a fonte de cada campo.

Snapshot original distribuído pelo Elosys (não representa os totais atuais da produção): **1,63 M candidaturas** (`consulta_cand` 2014–2026, ~1,18 M pessoas),
**1,04 M CNPJs de campanha**, **5,16 M doações** (R$ 26,7 bilhões, quem doou pra
cada CNPJ e quanto), **9,47 M despesas contratadas** (R$ 16,2 bilhões, pra quem
a campanha pagou), **10,89 M pagamentos** (R$ 18,85 bilhões, regime de caixa —
quando o dinheiro de fato saiu), **841 mil redes sociais declaradas** por
candidatura (Facebook/Instagram/X/site, obrigatório desde 2018), **25,5 mil
sanções federais** CEIS/CNEP (474 empresas sancionadas já cruzam com doador/
fornecedor de campanha) e **3,25 M bens declarados** (R$ 445,5 bilhões,
patrimônio no registro de candidatura). Banco ~11,4 GB.

---

## Plataforma em produção

Portal: [politica007.com.br](https://politica007.com.br/).

- Pesquisa unificada por fragmentos de nome, nome de urna, CPF e CNPJ, incluindo doadores e fornecedores.
- Consulta por cidade/UF/cargo/eleição e comparação de candidaturas em contextos compatíveis.
- Quadro societário, participações inversas, filiais, vínculos com grau de confiança e caminhos entre pessoas e empresas.
- Grafos com expansão gradual, filtros e explicação das evidências; documento mascarado não confirma identidade.
- Finanças contratadas e pagas separadas, concentração, origem de recursos e evolução por eleição.
- Votos por município, zona, seção e local de votação; patrimônio e processos eleitorais com pesquisa em toda a base e paginação.
- Publicações públicas por tema/período/contexto, propostas oficiais do TSE e integrações de Câmara, Senado e PNCP.
- Imagens compartilháveis em três formatos com domínio, fonte, data, período e QR; consultas salvas com alerta de mudanças enquanto o portal está aberto.
- Ficha pública, verificação de controle de domínio declarado ao TSE, esclarecimentos com fontes e fila de correções. Controle de domínio não é confirmação de identidade pessoal.
- Métricas agregadas e anônimas de navegação e compartilhamento.

A cobertura depende dos conjuntos públicos coletados. Processos são da Justiça Eleitoral; não representam todos os tribunais. A ausência de informação não deve ser apresentada como zero ou ausência de atividade. Consulte [Fontes e atualização](https://politica007.com.br/fontes/) para datas reais, limitações e falhas de cada fonte.

### Operação e atualização

As rotinas do Coolify verificam bases atuais do TSE, fontes históricas, propostas atuais e PNCP a cada quatro horas. Há auditoria diária e coleta diária de propostas históricas. Não existe garantia de atualização em tempo real: a publicação pelo órgão, o tamanho dos arquivos e a disponibilidade do serviço determinam o processamento.

Os coletores Python usam `/data/politica-source`, bibliotecas em `/data/elosys-python` e o comando persistente `scripts/refresh-tse.sh`. Os monitores e o cálculo dos sinais compartilham uma trava de escrita. Arquivos são validados e publicados atomicamente; uma falha preserva o conjunto válido anterior. PNCP respeita limites do provedor, repete requisições interrompidas e retoma o cursor salvo. A janela recente só é considerada fresca por quatro horas; sua data não é renovada quando a execução apenas retoma o histórico. O histórico é preenchido progressivamente.

O comando persistente de contratos é `ELOSYS_DB_PATH=/data/elosys.db node /data/politica-source/web/scripts/sync-public-sources.mjs`. O diretório `/data/politica-source/web/node_modules` aponta para `/app/node_modules`, as dependências da imagem em execução. Após atualizar o coletor, conferir a revisão do checkout persistente e executar uma sincronização real; a revisão do site e a revisão dos coletores podem diferir quando a mudança afeta apenas os coletores.

A base eleitoral principal continua sendo lida pelo site; propostas, contratos, cache, verificações e correções usam `politica-platform.db`. O backup consistente anterior à atualização está em `/data/backups/elosys-before-platform-20261003.db`. O relatório operacional e de verificação está em `delivery/public-network-platform.json`.

## Rodar com banco de dados

O jeito mais rápido: baixar o banco já pronto (~11,4 GB) e abrir o app web, sem
rodar nenhum crawler.

### 1. Baixar o banco

Arquivo `elosys.zip` (2,84 GB; descompactado, `elosys.db` tem ~11,4 GB). Os dois
links trazem o mesmo arquivo:

| Link | Origem |
|---|---|
| [archive.org/details/elosys](https://archive.org/details/elosys) | Internet Archive |
| [huggingface.co/datasets/YuriRDev/elosys](https://huggingface.co/datasets/YuriRDev/elosys/tree/main) | Hugging Face |

SHA-256 do `elosys.zip`:

```
96fb819b681752250db0c6cdc62566d1773338547daf6ea524edcd4024b16693
```

Confira o download antes de descompactar:

```sh
sha256sum elosys.zip                    # Linux/macOS/Git Bash
Get-FileHash elosys.zip -Algorithm SHA256   # PowerShell
```

Descompacte e deixe o `elosys.db` na **raiz do repositório** (ao lado deste README).
O banco já vem com todas as tabelas e com o índice de busca por nome de doador/fornecedor.

### 2. Executar localmente

Requisitos: [Node.js](https://nodejs.org/) 20.9+ e git.

```sh
git clone https://github.com/YuriRDev/elosys.git
cd elosys
# coloque o elosys.db baixado aqui, na raiz

cd web
npm install
npm run dev        # http://localhost:3000
```

O app abre a **base eleitoral principal em modo readonly**. Recursos complementares usam um banco separado. Para
apontar outro caminho:

```sh
ELOSYS_DB_PATH=/caminho/para/elosys.db npm run dev
```

Build de produção: `npm run build && npm run start`.

---

## Criar o banco do zero e popular

Reconstrói tudo a partir das fontes oficiais. **Demora**: os arquivos do TSE são
grandes (a prestação de contas passa de 1 GB por ano), o download vai para
`dados_tmp/` e é apagado depois de processado, e algumas etapas levam de minutos a
horas. Tenha ~15 GB livres em disco.

Requisitos: [uv](https://docs.astral.sh/uv/) (instala Python 3.12 e as dependências).

```sh
uv sync
uv run elosys init-db --db elosys.db
```

### Etapa 1 — coletar as fontes

Os comandos completos de coleta abaixo reconstroem as tabelas de cada fonte. Sem `--years`, processam todos os anos suportados. Os monitores de produção usam atualização atômica por ano/conjunto e preservam as demais eleições.

```sh
uv run elosys tse-candidates --db elosys.db      # candidaturas 2014–2026 (TSE consulta_cand)
uv run elosys tse-accounts   --db elosys.db      # CNPJ de campanha, doações e despesas (a etapa mais longa)
uv run elosys tse-social     --db elosys.db      # redes sociais declaradas
uv run elosys tse-assets     --db elosys.db      # bens declarados
uv run elosys tse-voting-sections --db elosys.db # votos por seção/local (2014, 2016, 2018, 2020, 2022, 2024)
uv run elosys tse-processual --db elosys.db      # processos eleitorais públicos e decisões (2018–2026)
uv run elosys transparencia-sanctions --db elosys.db   # CEIS/CNEP
uv run elosys transparencia-earmarks  --db elosys.db   # emendas parlamentares
```

`tse-voting-sections` usa os resultados nominais oficiais do TSE. Sem filtros,
baixa os arquivos de todas as UFs e eleições disponíveis; como são arquivos
grandes, a etapa pode demorar e aumenta o banco. Para começar com um recorte:

```sh
uv run elosys tse-voting-sections --db elosys.db --years 2024 --states SP
```

Execute `tse-candidates` antes, pois as linhas de votação são vinculadas à
candidatura registrada. Nos anos presidenciais (2014, 2018 e 2022), o TSE publica
um arquivo nacional separado; ele é incluído também numa coleta limitada a uma
UF. O nome e endereço do local não constam no arquivo de 2014, então nesse ano
a ficha mostra o número do local, a zona e a seção. Depois de importar, atualize
o artefato `elosys.db` usado pelo site para publicar a nova tabela junto com o
app.

Se um download der HTTP 403 (filtro anti-bot da fonte), baixe o `.zip` no
navegador, coloque em `dados_tmp/` com o nome que o log mostrou e rode o crawler
de novo: ele usa o arquivo local.

### Etapa 2 — enriquecer (incremental, opcional)

```sh
uv run elosys receita-cnpj --db elosys.db --limit 500     # cadastro e sócios de CNPJ (BrasilAPI, 1 request por CNPJ)
uv run elosys tse-photo-urls --db elosys.db --limit 500   # foto oficial dos candidatos
```

Os dois são incrementais (não apagam o que já existe): rode várias vezes para
cobrir mais CNPJs/candidatos.

### Etapa 3 — índice de busca por nome

A busca por doadores/fornecedores que nunca foram candidatos usa uma tabela FTS5
que não é preenchida por nenhum crawler. Rode depois de cada `tse-accounts`:

```sh
uv run python - <<'PY'
import sqlite3
con = sqlite3.connect("elosys.db")
con.executescript("""
DELETE FROM pessoa_fisica_search;
INSERT INTO pessoa_fisica_search (cpf, name)
SELECT cpf, max(name) FROM (
  SELECT donor_cpf_cnpj AS cpf, donor_name AS name FROM campaign_donation
    WHERE donor_company_id IS NULL AND donor_cpf_cnpj IS NOT NULL
      AND length(donor_cpf_cnpj) = 11 AND donor_name IS NOT NULL
  UNION ALL
  SELECT supplier_cpf_cnpj AS cpf, supplier_name AS name FROM campaign_expense
    WHERE supplier_company_id IS NULL AND supplier_cpf_cnpj IS NOT NULL
      AND length(supplier_cpf_cnpj) = 11 AND supplier_name IS NOT NULL
) GROUP BY cpf;
""")
con.commit()
PY
```

O monitor TSE também mantém os índices FTS5 de nomes de candidatos, empresas e
sócios. Eles são atualizados na primeira execução após uma mudança de versão e
continuam sincronizados por gatilhos do SQLite, evitando varreduras completas
das tabelas durante a pesquisa.

### Etapa 4 — regras de detecção

Rodam sobre o que já foi coletado e geram os sinais de alerta.

```sh
uv run elosys rule-disproportionate-expense --db elosys.db
uv run elosys rule-circular-donations       --db elosys.db   # ~25 min na base real
uv run elosys candidate-supplier-partner    --db elosys.db   # precisa do receita-cnpj (quadro societário)
```

### Etapa 5 — camadas opcionais com LLM / X

Precisam de chave em variável de ambiente (nunca commite chaves):

```sh
export DEEPSEEK_API_KEY=...                                  # segunda opinião sobre os sinais
uv run elosys ai-review --db elosys.db --limit 100 --order tight

export APIFY_TOKEN=...                                       # posts do X de contas declaradas ao TSE
uv run elosys social-x      --db elosys.db --scope federal
uv run elosys social-review --db elosys.db --limit 5000
```

### Etapa 6 — manifesto e testes

```sh
uv run elosys manifest --db elosys.db     # grava manifest.json com URL + SHA-256 de cada fonte
uv run pytest                             # testes (fixtures, sem rede)
```

Cada crawler é rewrite-only: a tabela passa a conter **exatamente os anos que você
passou** em `--years`. Para um estado 100% limpo, apague `elosys.db` e recomece.

---

## Como funciona, em uma frase

Cada fonte de dados tem um **crawler independente** (`elosys/tse/*.py`). Rodar um
crawler apaga as tabelas dele e reconstrói tudo do zero a partir dos arquivos do
governo. O banco é um artefato descartável; a prova de integridade fica no
`manifest.json`, versionado no git.

## O que fica no banco

| Tabela | O que é | Crawler |
|---|---|---|
| `politician_history` | Uma linha por candidatura por eleição (nome, partido, cargo, UF, situação, resultado, dados de registro) | `tse-candidates` |
| `people` | Pessoa (chave surrogate; `cpf`/`voter_id` como identificadores) — todo JOIN por pessoa passa aqui, nunca por CPF cru | compartilhada |
| `companies` | Empresa por CNPJ (`kind`: campaign/donor/supplier/sanctioned) | compartilhada |
| `campaign_org` | O CNPJ que cada candidatura abre para a campanha (Receita, natureza 409-4) | `tse-accounts` |
| `campaign_donation` | Cada doação recebida: quem doou (CPF/CNPJ, nome), quanto, quando, por qual via | `tse-accounts` |
| `campaign_expense` | Cada despesa contratada: pra quem a campanha pagou, quanto, por qual serviço | `tse-accounts` |
| `campaign_expense_payment` | Quando cada despesa foi de fato paga (pode ser em parcelas) | `tse-accounts` |
| `electoral_case` / `electoral_case_candidate` | Processo eleitoral público e parte candidata ligada pelo `SQ_CANDIDATO` | `tse-processual` |
| `electoral_case_subject` / `electoral_case_decision` / `electoral_case_appeal` | Assuntos, decisões e recursos do processo eleitoral | `tse-processual` |
| `social_media` | Redes sociais/site declarados no registro da candidatura (URL + rede detectada) | `tse-social` |
| `declared_assets` | Bens declarados no registro da candidatura (tipo, descrição, valor) | `tse-assets` |
| `company_registry` / `company_partner` | Data de abertura, situação cadastral e sócios de um CNPJ | `receita-cnpj` (incremental) |
| `sanction` | CEIS/CNEP: quem está impedido de contratar com o governo ou punido por corrupção | `transparencia-sanctions` |
| `rejected_cpf` | CPFs descartados por ambiguidade (mesmo CPF em >1 título eleitoral, etc.) e o motivo | `tse-candidates` |
| `source` / `collection` / `collection_file` / `parse` | Proveniência: de qual órgão, qual URL, qual arquivo, qual hash, qual parser saiu cada linha | todos |
| `rule_run` / `signal` / `signal_actor` / `signal_evidence` | Sinais de alerta gerados por regras de detecção (não vêm de nenhuma fonte — ver [`ADs/dados_derivados.md`](ADs/dados_derivados.md)) | `rule-disproportionate-expense`, `rule-circular-donations` |
| `signal_ai_review` | Segunda opinião de um LLM sobre cada sinal (rotineiro vs. bizarro), com a resposta e o prompt salvos verbatim | `ai-review` (opcional, precisa de `DEEPSEEK_API_KEY`) |
| `candidate_supplier_partner` | Candidato que aparece no quadro societário de empresa que recebeu pagamento de campanha (match nome + 6 dígitos do CPF — **não** determinístico) | `candidate-supplier-partner` |

Toda linha de dado tem `provenance_id` → `parse` → `collection` → `source`.
"De onde veio isso?" é um `JOIN`.

## Sinais de alerta (regras de detecção)

Diferente das tabelas acima, `rule_run`/`signal`/`signal_actor`/`signal_evidence`
**não vêm de nenhuma fonte** — são geradas pelo nosso código sobre os dados já
coletados. Mesma disciplina de proveniência: toda linha em `signal_evidence`
aponta pra uma linha real (que por sua vez tem seu próprio `provenance_id`), e
`severity` só existe como `low`/`medium`/`high` — nunca "confirmado" ou
"fraude". Ver [`ADs/dados_derivados.md`](ADs/dados_derivados.md).

**Primeira regra: `disproportionate_expense`** ("despesa desproporcional") —
item tipicamente barato (18 categorias: caneta, adesivo, crachá...) identificado
em `campaign_expense.description` com valor muito acima do normal **para aquela
categoria**: `medium` a partir de 15x a mediana histórica da categoria, `high`
a partir de 30x (piso de R$ 1.000; categorias com menos de 20 despesas usam o
piso fixo de R$ 5 mil / R$ 50 mil). Rodada contra a base real: **28.743
sinais** (13.856 `high`, 14.887 `medium`). Maior caso: **R$ 2.504.200,00** em
"PRAGÕES, BIG HAND, PERFURADO, PRAGUINHA, ADESIVO" (9.879x a mediana de R$ 253,50).
O TSE não publica quantidade nesse arquivo, só o valor total — a regra não
calcula preço unitário. Pode ser lote grande, item não detalhado na descrição,
ou erro de digitação — por isso é indício, não prova. A página
[`/sinais/despesa-desproporcional`](web/src/app/sinais/despesa-desproporcional/page.tsx)
lista quem mais gastou por categoria, como % da receita da campanha e contra a
média de candidatos do mesmo cargo e estado.

**Segunda regra: `circular_donations`** ("doação circular") — constrói um
grafo dirigido (doador → candidato, candidato → fornecedor) sobre a base
inteira e usa Tarjan (SCC) + DFS limitado em profundidade (padrão: 5 nós)
pra achar ciclos: dinheiro que sai de uma campanha e volta pra mesma cadeia.
Rodada contra a base real: grafo de **5,35M nós / 7,66M arestas**, **108.400
ciclos encontrados**; só viram sinal os que movimentaram mais de R$ 10.000 no
total: **38.267 sinais** (10.705 `high` ≤ 3 nós, 27.562 `medium`). Interface em
[`/sinais/doacao-circular`](web/src/app/sinais/doacao-circular/page.tsx) —
filtro por severidade, **ordenável por valor movimentado ou tamanho do
caminho** — com link direto pro grafo interativo. Mesma disciplina: indício,
não prova — pode ser coincidência de coligação, ressarcimento, ou merecer
checagem manual.

**Cruzamento: `candidate_supplier_partner`** — candidato que aparece no
quadro societário de uma empresa que recebeu pagamento de campanha. O CPF do
sócio vem mascarado da Receita, então o match é `normalize(nome) ==
canonical_name` **E** os 6 dígitos visíveis do CPF batendo — **não é
identidade confirmada** (fica fora de `people`/`signal_actor`, rotulado
"possível"). Ambíguos (2+ pessoas batendo) são descartados. Rodado contra a
base real: **533 vínculos possíveis** (R$ 197,9 mi movimentados nessas
empresas), **66** onde a própria campanha do candidato pagou a empresa dele
(gráfica própria imprimindo material de campanha, escritório de advocacia
próprio, etc.). Interface em
[`/sinais/socio-fornecedor`](web/src/app/sinais/socio-fornecedor/page.tsx).

**Camada opcional: `ai-review`** (`elosys/rules/ai_review.py`) — passa os
fatos de cada sinal de doação circular / despesa desproporcional pra um LLM
barato (DeepSeek) e pergunta: *rotineiro* ou *genuinamente estranho*? A
resposta, a explicação, os fatos citados e o **prompt exato** ficam salvos em
`signal_ai_review` (um por sinal+modelo), pra um humano poder conferir o
raciocínio do modelo contra os dados. Incremental (não rewrite-only): roda de
novo pra revisar mais, `--refresh` re-revisa. Ordena por valor (`--order
amount`, pega os casos de conta-de-partido que o modelo tende a achar
plausíveis) ou por ciclo mais curto (`--order tight`). Chave via
`DEEPSEEK_API_KEY` no ambiente — **nunca commitada**. Interface em
[`/sinais/analise-ia`](web/src/app/sinais/analise-ia/page.tsx). Continua
sendo indício — agora com a opinião de uma máquina, que também erra.

## Os arquivos de log e auditoria

Cada execução de crawler escreve/atualiza, ao lado do `.db`:

- **`manifest.json`** — a lista de *todos* os arquivos baixados, com `url`,
  `accessed_at`, `sha256` do `.zip` e `sha256` de cada CSV dentro dele. **É a âncora
  de não repúdio**: você commita esse arquivo no git, e aí o histórico público do
  repositório prova o que foi coletado e quando.
- **`tse_candidates_report.json`, `tse_accounts_report.json`, `tse_social_report.json`**
  — o relatório daquela execução: linhas lidas por ano, CNPJs/candidaturas/URLs
  gerados, CPFs derrubados por ambiguidade (com o motivo), quantas linhas ficaram
  sem vínculo de identidade.

Além disso, **o próprio console é um log**: cada crawler imprime a URL, o tamanho e
o hash do arquivo, o progresso da leitura linha a linha, e um resumo por ano.

## Conceitos de arquitetura (ADs)

As decisões estão em [`ADs/`](ADs/), uma por assunto. Resumo:

| AD | Ideia central |
|---|---|
| [`confiabilidade.md`](ADs/confiabilidade.md) | **Não repúdio.** Nenhuma linha existe sem apontar para a coleta que a originou. Não guardamos o arquivo bruto — guardamos `URL + data + SHA256`, e você re-baixa para conferir. |
| [`imutabilidade.md`](ADs/imutabilidade.md) | **Rewrite-only.** O banco é reconstruído do zero a cada execução. A garantia contra "editar o passado" é o `manifest.json` commitado + build determinístico, não triggers nem hash chain. |
| [`banco.md`](ADs/banco.md) | **SQLite**, arquivo único, sem servidor. Convenções de tipo (datas ISO em UTC, dinheiro em centavos, nomes de tabela/coluna em inglês). |
| [`identidade.md`](ADs/identidade.md) | Identidade é **afirmação nossa**, não dado da fonte. Match determinístico por título eleitoral e CPF. Na dúvida (CPF ambíguo), **não afirma** — descarta o CPF e registra o porquê. |
| [`politician.md`](ADs/politician.md) | Sem tabela "o político X"; só "a candidatura de X no ano N" (`politician_history`). CPF mascarado de 2024 tratado por título eleitoral. `campaign_org` para o CNPJ de campanha. |
| [`dados_derivados.md`](ADs/dados_derivados.md) | Correlações e flags (`disproportionate_expense`, `circular_donations`) também têm proveniência: qual regra, qual versão, sobre quais linhas. Severidade só `low/medium/high`, nunca "confirmado". |

## Fontes de dados (todas oficiais/públicas)

| Fonte | O que traz | Estado |
|---|---|---|
| TSE — `consulta_cand` | Cadastro de candidaturas | ✅ coletado (2014–2026) |
| TSE — prestação de contas eleitorais | CNPJ de campanha; doações e despesas | ✅ coletado (CNPJ, doações, despesas contratadas e pagas) |
| TSE — `rede_social_candidato` | Redes sociais/site declarados no registro (obrigatório desde a Res. 23.610/2019) | ✅ coletado (2018–2026) |
| X/Twitter (via Apify) | Posts/replies de contas **declaradas ao TSE**, filtrados por léxico e triados por LLM (`social-x` + `social-review`, ver ADs/dados_derivados.md §1.4) | ✅ eleitos federais |
| TSE — `bem_candidato` | Bens declarados no registro (base do sinal de patrimônio) | ✅ coletado (2014–2026) |
| TSE/SJD — `Processual` | Processos eleitorais, partes, assuntos, decisões e recursos | ✅ coletor disponível (2018–2026); associação de partes pelo `SQ_CANDIDATO` |
| TSE — `foto_cand` (DivulgaCandContas, busca por CPF) | Foto oficial por candidatura | ✅ coletado (parcial, incremental — ver ADs/politician.md §5) |
| TSE — DivulgaCandContas | Certidões criminais | ⬜ pendente |
| Receita Federal (BrasilAPI) | Quadro societário de CNPJ, data de abertura, capital | ✅ coletado (incremental — não é rewrite-only, ver ADs/politician.md §2.3) |
| CNJ — DataJud | Metadados de processos judiciais públicos | ⛔ não permite identificar todos os processos de uma pessoa física com segurança — ver nota abaixo |
| Portal da Transparência — CEIS/CNEP | Empresas/pessoas impedidas de contratar com o governo ou punidas por corrupção | ✅ coletado (snapshot diário) |
| Portal da Transparência / PNCP | Emendas, beneficiários e execução; contratos de fornecedores | ✅ emendas coletadas; PNCP com janela recente e histórico incremental |
| Câmara / Senado — dados abertos | Proposições, votações, cota parlamentar (CEAP) | ✅ consulta sob demanda com associação conservadora de identidade e cache de até quatro horas |

**Não coletamos** (protegido / sigiloso): endereço residencial, telefone e e-mail
pessoal de candidatos; antecedentes fora de processo público; relatórios do COAF.

### Processos eleitorais e limite da cobertura nacional

O Portal de Dados Abertos do TSE publica arquivos oficiais do conjunto
[`Processual`](https://dadosabertos.tse.jus.br/pt_BR/dataset/?groups=processual)
para os pleitos de 2018, 2020, 2022, 2024 e 2026. Os arquivos incluem processo,
partes, assuntos, decisões e recursos, e a licença indicada é Creative Commons
Atribuição. O coletor `elosys tse-processual` importa esses dados para o banco e
liga a parte candidata ao perfil por `SQ_CANDIDATO` e ano da candidatura — nunca
por semelhança de nome. O perfil mostra o número, órgão, classe, assuntos,
participação, decisões e recursos com proveniência e link direto para o processo
no PJe. Processos sob sigilo não aparecem no conjunto público.

Isso cobre a Justiça Eleitoral e os pleitos para os quais o TSE mantém esses
arquivos. **Não é uma lista de todos os processos cíveis, criminais,
trabalhistas, federais ou estaduais de cada pessoa.** A API Pública do DataJud
centraliza metadados processuais, mas a regra vigente especifica os polos quando
são pessoas jurídicas e exclui ou anonimiza casos em segredo de justiça. Além
disso, seus termos vedam distribuição ou exploração comercial dos dados. Por
isso ela não é uma fonte adequada para construir uma lista pessoal completa no
Politica007. Consulte também a [Portaria CNJ nº 374/2026](https://atos.cnj.jus.br/atos/detalhar/6972).

Não associamos casos de outras bases a uma pessoa apenas porque o nome coincide:
isso confundiria homônimos. E a presença de um processo não significa culpa ou
condenação; os detalhes e decisões devem ser lidos no registro oficial.

## Premissa legal e ética

- Todas as fontes são **públicas por determinação legal/judicial**.
- CPF de candidato: mascarado em 2024 (decisão do TSE por LGPD), revertido para 2026.
  A base de 2024 é reconciliada por título eleitoral — ver [`ADs/identidade.md`](ADs/identidade.md).
- O resultado é **indício, não prova**. O sistema gera sinais de alerta, não
  conclusões. Nada aqui deve virar acusação pública sem apuração formal.
