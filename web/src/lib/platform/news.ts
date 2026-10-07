import {db,hasTable} from "@/lib/db";
import {platformStore} from "@/lib/platform/store";
import {cache} from "react";

export type NewsSource={label:string;url:string};
export type NewsHighlight={label:string;value:string;detail:string};
export type NewsMarketComparison={supplier:string;product:string;price:string;unit:string;note:string;checkedAt:string;url:string};
export type DailyNewsArticle={
  slug:string;personId:number;personName:string;title:string;summary:string;category:string;
  publishedAt:string;body:string[];highlights:NewsHighlight[];sources:NewsSource[];marketComparisons?:NewsMarketComparison[];
};
export type DailyNewsFeed={day:string;generatedAt:string|null;trackedProfiles:number;articles:DailyNewsArticle[]};
export type DailyNewsArchiveEntry={day:string;generatedAt:string;articleCount:number};

const openingEditionDay="2026-10-04";
const openingArticleSlug="p28350-adesivos-estreia";
const priceCheckedAt="2026-10-05";

function adhesiveMarketComparisons(description:string):NewsMarketComparison[]{
  const normalized=description.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(!/adesiv/.test(normalized))return [];
  if(/perfur/.test(normalized))return [
    {supplier:"Gráfica AlphaPrint",product:"Adesivo de vinil microperfurado impresso por área",price:"R$ 28,90",unit:"m²",note:"Preço publicado para 1 a 1.000 m². A loja informa limite de 1,35 m de largura e pede envio da arte; frete e condições devem ser confirmados.",checkedAt:priceCheckedAt,url:"https://www.graficaalphaprint.com.br/adesivo-micro-perfurado-w25"},
    {supplier:"Segunda Via Gráfica",product:"Vinil microperfurado impresso",price:"R$ 80,00",unit:"m²",note:"A página informa mínimo de R$ 12 por pedido. A opção com recorte digital aparece por R$ 95/m²; arte, quantidade e frete podem alterar o custo.",checkedAt:priceCheckedAt,url:"https://www.segundaviagrafica.com.br/produtos/adesivos-microperfurados1/"},
  ];
  if(!/vinil/.test(normalized))return [];
  return [
    {supplier:"Fadrix",product:"Vinil brilho ou fosco impresso, sem corte",price:"R$ 29,00",unit:"m²",note:"A página informa compra mínima de 1 m²; impressão comum, sem corte eletrônico.",checkedAt:priceCheckedAt,url:"https://revenda.fadrix.com.br/adesivos/1306-adesivo-vinil-personalizado-m2.html"},
    {supplier:"Quick Gráfica",product:"Adesivo vinil por metro quadrado",price:"A partir de R$ 69,00",unit:"m²",note:"Preço anunciado como inicial; a página descreve impressão em vinil e opções de corte. Frete e especificação alteram o orçamento.",checkedAt:priceCheckedAt,url:"https://www.quickgrafica.com.br/categoria/adesivos-e-etiquetas/adesivo-metro-quadrado"},
    {supplier:"Segunda Via Gráfica",product:"Vinil impresso; acabamentos opcionais",price:"R$ 100,00 a R$ 140,00",unit:"m²",note:"A página lista R$ 100/m² para impressão eco solvente; R$ 120/m² com recorte ou laminação; R$ 140/m² com ambos.",checkedAt:priceCheckedAt,url:"https://www.segundaviagrafica.com.br/produtos/adesivos-em-uv/"},
  ];
}

function openingEditionArticle(publishedAt:string):DailyNewsArticle{
  return {
    slug:openingArticleSlug,personId:28350,personName:"Flávio Nantes Bolsonaro",
    title:"TSE lista R$ 766 mil em dois lançamentos de adesivos da campanha de Flávio Bolsonaro",
    summary:"Um registro descreve adesivo de vinil por R$ 396 mil e outro, adesivo perfurado por R$ 370 mil. Os seis lançamentos da categoria somam R$ 965,5 mil.",
    category:"Pauta especial de estreia",publishedAt,
    body:[
      "A prestação de contas eleitoral de 2026 disponibilizada pelo Tribunal Superior Eleitoral registra dois gastos da campanha de Flávio Nantes Bolsonaro cuja descrição menciona adesivos. Um lançamento informa R$ 396 mil para “adesivo para choque em vinil — presidente Flávio Bolsonaro — 100x300mm”; outro registra R$ 370 mil para “adesivo perfurado — Flavio Bolsonaro Presidente 22”. Somados, os dois valores chegam a R$ 766 mil. São valores declarados na base eleitoral; a descrição, sozinha, não informa quantas unidades foram produzidas nem o custo por unidade.",
      "A concentração também aparece no conjunto da categoria. O Politica007 localizou seis registros classificados como adesivos, que somam R$ 965.496. Os dois maiores correspondem a aproximadamente 79,3% desse total. Esses números ajudam a dimensionar os lançamentos, mas dependem da classificação dos itens e não substituem a leitura de cada documento, contrato ou comprovante.",
      "O motivo do destaque é estatístico: cada lançamento está muito acima da mediana histórica de R$ 253,50 para despesas classificadas nessa categoria na base comparativa consultada. R$ 396 mil equivalem a cerca de 1.562 vezes essa mediana; R$ 370 mil, a cerca de 1.460 vezes. A comparação identifica valores fora do padrão observado e orienta uma conferência. Ela não é uma conclusão do TSE, não mede o preço de um adesivo específico e não prova superfaturamento ou outra irregularidade.",
      "Para vinil comum impresso por área, as páginas consultadas em 5 de outubro de 2026 exibiam R$ 29/m² na Fadrix (sem corte, com mínimo de 1 m²), preço inicial de R$ 69/m² na Quick Gráfica e R$ 100/m² na Segunda Via para impressão eco solvente, chegando a R$ 120–140/m² com recorte e/ou laminação. Para o item descrito como perfurado, há referências mais próximas de produto: a AlphaPrint anunciava vinil microperfurado por R$ 28,90/m², enquanto a Segunda Via informava R$ 80/m² impresso e R$ 95/m² com recorte digital. Os anúncios e as condições publicados por cada fornecedor estão vinculados abaixo.",
      "As referências de microperfurado são mais específicas que as de vinil comum, mas ainda não formam uma cotação equivalente ao material da campanha. As páginas têm limites de largura, acabamentos, pedido mínimo, envio de arte e frete próprios. Para o outro lançamento, a descrição menciona vinil sem indicar corte ou laminação. A prestação de contas não informa quantas peças foram compradas nem se o valor inclui serviços adicionais. A menção a “100x300mm”, se estiver em milímetros, descreve uma área de 0,03 m² por peça, mas sem quantidade e especificação completa essa medida não permite calcular o custo final por unidade ou por metro quadrado.",
      "Para esclarecer a composição dos valores seriam necessários, entre outros documentos, a quantidade entregue de cada modelo, a unidade de cobrança, as dimensões e características finais, notas fiscais, comprovantes de pagamento e a identificação do que foi efetivamente fornecido. Também é preciso distinguir valor contratado de valor pago: um lançamento financeiro não demonstra, por si só, a execução integral do serviço ou a análise final das contas.",
      "O dado verificável neste momento é que a prestação de contas contém dois lançamentos de alto valor, com descrições de adesivos, e que ambos destoam fortemente da mediana usada pelo alerta comparativo. As páginas de fornecedores oferecem contexto de preço por metro quadrado, mas não resolvem a ausência de quantidade e de especificações equivalentes. A conclusão sobre a regularidade depende dos documentos completos e da análise das autoridades competentes.",
    ],
    highlights:[{label:"Dois lançamentos destacados",value:"R$ 766.000,00",detail:"R$ 396.000 em adesivo de vinil + R$ 370.000 em adesivo perfurado · 2026"}],
    sources:[{label:"Prestação de contas eleitorais de 2026 · TSE",url:"https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-2026"}],
    marketComparisons:[...adhesiveMarketComparisons("adesivo para choque em vinil"),...adhesiveMarketComparisons("adesivo perfurado em vinil")],
  };
}

type PopularProfile={personId:number;views:number};
type Candidate={id:number;name:string;historyId:number;year:number;office:string|null;party:string|null;state:string|null;municipality:string|null;result:string|null};
type StoryFacts={candidate:Candidate;views:number;processCount:number;openProcessCount:number;recentProcess?:{number:string;year:number;filedAt:string|null;closedAt:string|null;className:string|null;subject:string|null;lastDecisionAt:string|null;lastDecisionType:string|null;pole:string|null;sourceUrl:string|null};signals:Array<{year:number;description:string|null;amountCents:number;explanation:string;sourceUrl:string|null}>;votes?:{year:number;votes:number;sections:number;municipalities:number};donations?:{year:number;count:number;amountCents:number};expenses?:{year:number;count:number;amountCents:number};assets?:{year:number;count:number;valuedCount:number;amountCents:number}};

function saoPauloDay(date=new Date()):string{const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`;}
function brl(cents:number):string{return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);}
function number(value:number):string{return value.toLocaleString("pt-BR");}
function datasetUrl(kind:"candidatos"|"prestacao"|"resultados"|"processual",year:number):string{
  const slug=kind==="prestacao"?`dadosabertos-tse-jus-br-dataset-prestacao-de-contas-eleitorais-${year}`:`${kind}-${year}`;
  return `https://dadosabertos.tse.jus.br/pt_BR/dataset/${slug}`;
}
function source(label:string,url:string|null|undefined):NewsSource|null{
  if(!url)return null;
  try{const u=new URL(url);if(!/(^|\.)tse\.jus\.br$/.test(u.hostname))return null;return {label,url:u.toString()};}catch{return null;}
}
function getCandidateFacts(personId:number,views:number):StoryFacts|null{
  const candidate=db().prepare(`SELECT p.id,p.canonical_name AS name,h.id AS historyId,h.year,h.office,h.party_abbr AS party,h.state,h.municipality,h.result
    FROM people p JOIN politician_history h ON h.id=(SELECT hh.id FROM politician_history hh WHERE hh.person_id=p.id ORDER BY hh.year DESC,hh.round DESC,hh.id DESC LIMIT 1)
    WHERE p.id=?`).get(personId) as Candidate|undefined;
  if(!candidate?.name)return null;
  const facts:StoryFacts={candidate,views,processCount:0,openProcessCount:0,signals:[]};

  if(["electoral_case","electoral_case_candidate"].every(hasTable)){
    const totals=db().prepare(`SELECT count(*) AS total,sum(is_open) AS open FROM (
      SELECT ec.id,max(CASE WHEN ec.closed_at IS NULL THEN 1 ELSE 0 END) AS is_open
      FROM electoral_case_candidate cc JOIN electoral_case ec ON ec.id=cc.case_id WHERE cc.person_id=? GROUP BY ec.id
    )`).get(personId) as {total:number;open:number};
    facts.processCount=totals.total||0;facts.openProcessCount=totals.open||0;
    const latest=db().prepare(`SELECT ec.case_number AS number,ec.source_dataset_year AS year,ec.filed_at AS filedAt,ec.closed_at AS closedAt,ec.class_name AS className,
      ec.main_subject AS subject,ec.last_decision_at AS lastDecisionAt,ec.last_decision_type AS lastDecisionType,cc.pole,
      COALESCE(NULLIF(ec.source_url,''),col.url) AS sourceUrl
      FROM electoral_case_candidate cc JOIN electoral_case ec ON ec.id=cc.case_id
      LEFT JOIN parse pa ON pa.id=ec.provenance_id LEFT JOIN collection col ON col.id=pa.collection_id
      WHERE cc.person_id=? ORDER BY COALESCE(ec.last_decision_at,ec.filed_at,ec.distributed_at,'') DESC,ec.case_number LIMIT 1`).get(personId) as StoryFacts["recentProcess"];
    facts.recentProcess=latest;
  }

  if(["signal","signal_actor","signal_evidence","campaign_expense","rule_run"].every(hasTable)){
    facts.signals=db().prepare(`SELECT ce.year,ce.description,ce.amount_cents AS amountCents,s.explanation,coalesce(col.url,'') AS sourceUrl
      FROM signal_actor sa JOIN signal s ON s.id=sa.signal_id JOIN rule_run rr ON rr.id=s.rule_run_id
      JOIN signal_evidence se ON se.signal_id=s.id AND se.table_name='campaign_expense'
      JOIN campaign_expense ce ON ce.id=se.record_id LEFT JOIN parse pa ON pa.id=ce.provenance_id LEFT JOIN collection col ON col.id=pa.collection_id
      WHERE sa.type='person' AND sa.actor_id=? AND rr.rule='disproportionate_expense'
      ORDER BY ce.amount_cents DESC,ce.year DESC LIMIT 3`).all(personId) as StoryFacts["signals"];
  }

  if(hasTable("election_vote_section")){
    const vote=db().prepare(`SELECT ph.year,sum(v.votes) AS votes,count(*) AS sections,count(DISTINCT v.municipality_code) AS municipalities
      FROM politician_history ph JOIN election_vote_section v ON v.history_id=ph.id WHERE ph.person_id=?
      GROUP BY ph.id,ph.year ORDER BY ph.year DESC LIMIT 1`).get(personId) as StoryFacts["votes"];
    if(vote&&vote.sections>0)facts.votes=vote;
  }

  const donation=db().prepare(`SELECT co.year,count(*) AS count,coalesce(sum(d.amount_cents),0) AS amountCents
    FROM campaign_donation d JOIN campaign_org co ON co.id=d.campaign_org_id WHERE co.person_id=?
    GROUP BY co.year ORDER BY co.year DESC LIMIT 1`).get(personId) as StoryFacts["donations"];
  if(donation?.count)facts.donations=donation;
  const expense=db().prepare(`SELECT co.year,count(*) AS count,coalesce(sum(e.amount_cents),0) AS amountCents
    FROM campaign_expense e JOIN campaign_org co ON co.id=e.campaign_org_id WHERE co.person_id=?
    GROUP BY co.year ORDER BY co.year DESC LIMIT 1`).get(personId) as StoryFacts["expenses"];
  if(expense?.count)facts.expenses=expense;
  if(hasTable("declared_assets")){
    const assets=db().prepare(`SELECT year,count(*) AS count,count(value_cents) AS valuedCount,coalesce(sum(value_cents),0) AS amountCents
      FROM declared_assets WHERE person_id=? GROUP BY year ORDER BY year DESC LIMIT 1`).get(personId) as StoryFacts["assets"];
    if(assets?.count)facts.assets=assets;
  }
  return facts;
}

function topicStories(facts:StoryFacts,publishedAt:string):DailyNewsArticle[]{
  const {candidate:c}=facts;const stories:DailyNewsArticle[]=[];
  const make=(slugPart:string,category:string,title:string,summary:string,body:string[],highlight:NewsHighlight,sourceItem:NewsSource,marketComparisons?:NewsMarketComparison[])=>stories.push({
    slug:`p${c.id}-${slugPart}`,personId:c.id,personName:c.name,title,summary,category,publishedAt,
    body,highlights:[highlight],sources:[sourceItem],...(marketComparisons?.length?{marketComparisons}:{}),
  });
  const caseSource=(facts.recentProcess&&source("Processos eleitorais · TSE",facts.recentProcess.sourceUrl))||{label:"Processos eleitorais · base oficial do TSE",url:datasetUrl("processual",facts.recentProcess?.year||c.year)};
  const signalSource=(signal:StoryFacts["signals"][number])=>source("Prestação de contas · registro de despesa",signal.sourceUrl)||{label:"Prestação de contas eleitorais · TSE",url:datasetUrl("prestacao",signal.year)};
  // Pautas com possível interesse público vêm primeiro; o texto preserva a distinção entre registro, sinal e conclusão.
  for(const [index,signal] of facts.signals.entries()){
    const marketComparisons=adhesiveMarketComparisons(signal.description||"");
    const marketCopy=marketComparisons.length
      ?`Como referência de mercado para ${/perfur/i.test(signal.description||"")?"vinil microperfurado":"vinil impresso"}, fornecedores consultados em ${new Date(`${priceCheckedAt}T12:00:00-03:00`).toLocaleDateString("pt-BR")} publicavam ${marketComparisons.map(item=>`${item.supplier}: ${item.price}/${item.unit}`).join("; ")}. As páginas descrevem produtos e condições comerciais próprios; são referências de catálogo, não cotações desta campanha nem prova de equivalência. Os detalhes, ressalvas e links para conferência estão na seção de referências comerciais.`
      :"Não há, nesta matéria, uma cotação comercial verificada com unidade, especificações e data compatíveis para esse item. Por isso, não classificamos o registro como acima ou abaixo do preço de mercado; o destaque se limita ao critério estatístico descrito pela regra e ao valor informado na base pública.";
    make(`despesa-${index+1}`,"Alerta comparativo",`Sinal comparativo destaca despesa de ${brl(signal.amountCents)} na campanha de ${c.name}`,
      `${signal.description||"Despesa de campanha"} · ${signal.year}. O alerta compara valores; não afirma que houve irregularidade.`,
      [
        `A prestação de contas de ${signal.year} registra uma despesa de ${brl(signal.amountCents)} vinculada à campanha de ${c.name}. A descrição disponibilizada é “${signal.description||"não informada"}”. O registro informa valor e descrição, mas nem sempre reúne na mesma linha quantidade, preço unitário, medidas, acabamento, prazo e comprovantes necessários para reconstruir o custo final.`,
        `O lançamento recebeu um sinal comparativo porque a regra automática o identificou como distante do padrão de despesas semelhantes observado na base. O critério é uma triagem para leitura humana: ele aponta um dado que merece contexto e não representa denúncia, auditoria oficial ou decisão do TSE. A explicação da regra e o registro de origem podem ser conferidos na fonte indicada.`,
        marketCopy,
        `Mesmo quando existe preço comercial publicado, comparar totais sem conhecer a quantidade pode produzir uma conta enganosa. Impressão personalizada pode envolver dimensões, material, arte, corte, laminação, instalação, frete, urgência e compra em lote. Os anúncios listados abaixo foram consultados na data indicada; são preços de oferta de empresas e podem mudar, além de não assegurarem equivalência com o item contratado.`,
        `Para avaliar esse gasto de forma completa, é preciso conferir a unidade e o volume contratados, a nota fiscal, a comprovação do pagamento, a entrega do material e eventuais aditivos ou serviços associados. Também é importante verificar se o valor informado é contratado, pago ou apenas lançado, pois esses campos têm significados diferentes nas bases eleitorais.`,
        `O que os dados permitem afirmar é que o valor e a descrição constam na prestação de contas e que a regra os separou para conferência comparativa. O sinal, isoladamente, não demonstra preço excessivo nem irregularidade. Uma conclusão depende de documentos equivalentes, do contexto da contratação e da análise oficial do caso.`,
      ],
      {label:"Valor registrado",value:brl(signal.amountCents),detail:`${signal.description||"Descrição não informada"} · ${signal.year}`},signalSource(signal),marketComparisons);
  }
  if(facts.processCount){
    const p=facts.recentProcess;const status=p?.closedAt?`A base informa encerramento em ${p.closedAt}.` : "A base não traz data de encerramento; isso não confirma que o processo continue ativo hoje.";
    const lastDecision=p?.lastDecisionType?` Última decisão listada: ${p.lastDecisionType}${p.lastDecisionAt?` (${p.lastDecisionAt})`:""}.`:"";
    make("processos","Processos eleitorais",`${number(facts.processCount)} processo${facts.processCount===1?"":"s"} eleitoral${facts.processCount===1?"":"is"} ligado${facts.processCount===1?"":"s"} ao registro de ${c.name}`,
      `${number(facts.openProcessCount)} processo${facts.openProcessCount===1?"":"s"} sem data de encerramento preenchida na base. Processo não significa culpa ou condenação.`,
      [`A base processual consultada relaciona ${number(facts.processCount)} registro${facts.processCount===1?"":"s"} eleitoral${facts.processCount===1?"":"is"} a candidaturas associadas a ${c.name}. Esse total é uma contagem de vínculos encontrados nos dados disponíveis, não uma contagem de condenações. Um mesmo processo pode ter mais de uma parte, e a ficha pública pode reunir diferentes registros eleitorais da mesma pessoa.`,
        `O caso mais recente na ordenação da base é o processo ${p?.number||"sem número disponível"}${p?.className?`, classificado como ${p.className}`:""}${p?.subject?`, com assunto principal registrado como “${p.subject}”`:""}${p?.pole?`; a pessoa aparece no polo ${p.pole}`:""}. Esses campos reproduzem metadados processuais; para compreender o que foi pedido, decidido e por quem, é necessário ler as peças e decisões do processo.`,
        `${status}${lastDecision} A ausência de data de encerramento na base não confirma que o caso esteja ativo, assim como uma data de encerramento não explica, por si, o resultado ou o fundamento da decisão. A situação pode ter sido atualizada no tribunal depois da coleta do dado.`,
        `Processos eleitorais podem tratar de temas diversos, tramitar em fases diferentes e terminar sem condenação. A existência de um registro não prova culpa, crime ou inelegibilidade. Esta matéria não atribui responsabilidade nem presume o resultado; apresenta apenas a associação encontrada e os campos identificadores disponíveis.`,
        `Para checar o caso, consulte o número processual na fonte oficial, confira a classe, o assunto, as partes, as decisões e a movimentação mais recente. Se houver divergência entre o resumo do portal e o andamento judicial, prevalece o documento atualizado do tribunal. A fonte oficial e a ficha pública estão ligadas nesta página.`],
      {label:"Processos eleitorais associados",value:number(facts.processCount),detail:`${number(facts.openProcessCount)} sem data de encerramento na base; situação atual deve ser conferida no tribunal.`},caseSource);
  }
  if(facts.expenses)make("despesas","Prestação de contas",`Quanto a campanha de ${c.name} declarou em despesas?`,
    `${brl(facts.expenses.amountCents)} em ${number(facts.expenses.count)} registros de ${facts.expenses.year}.`,
    [`A prestação de contas associada à candidatura de ${c.name} reúne ${number(facts.expenses.count)} lançamentos de despesas em ${facts.expenses.year}, somando ${brl(facts.expenses.amountCents)}. O total agrega itens diferentes e, por isso, não representa o preço de um produto único nem permite identificar sozinho onde se concentrou o gasto.`,
      `Os registros eleitorais podem distinguir despesas contratadas, pagas e outros estágios financeiros. Este resumo soma os valores que a base classifica como despesas vinculadas à conta da campanha. Ele não deve ser interpretado automaticamente como valor integralmente pago, aprovado ou irregular; cada linha e seu estado documental precisam ser consultados.`,
      `Uma leitura útil separa as despesas por fornecedor, descrição, data e valor, e verifica se há pagamentos correspondentes. Essa decomposição permite enxergar quais tipos de serviço respondem pela maior parcela e evita comparar serviços heterogêneos, como produção gráfica, transporte, pessoal e locação, como se fossem uma categoria só.`,
      `Para comparar um item com preços de mercado, é necessário conhecer sua unidade, quantidade, especificação e condições de entrega. Sem esses elementos, um total contratado não informa preço unitário e não pode ser comparado diretamente com uma vitrine de varejo ou com um preço por metro quadrado.`,
      `A página liga a prestação de contas original do TSE e a ficha pública da candidatura para que o leitor confira os dados de origem. Valores publicados podem mudar conforme retificações e atualizações oficiais; este texto resume a coleta disponível e não substitui a prestação de contas nem o julgamento das contas.`],
    {label:"Despesas contratadas",value:brl(facts.expenses.amountCents),detail:`${number(facts.expenses.count)} registros · ${facts.expenses.year}`},{label:"Prestação de contas · TSE",url:datasetUrl("prestacao",facts.expenses.year)});
  if(facts.donations)make("receitas","Prestação de contas",`Receitas declaradas pela campanha de ${c.name} somam ${brl(facts.donations.amountCents)}`,
    `${number(facts.donations.count)} registros de receitas na eleição de ${facts.donations.year}.`,
    [`A base de prestação de contas reúne ${number(facts.donations.count)} lançamentos de receita vinculados à campanha de ${c.name} em ${facts.donations.year}, no total de ${brl(facts.donations.amountCents)}. A soma descreve os registros coletados e não identifica, por si só, a origem econômica ou a modalidade de cada entrada.`,
      `As receitas eleitorais podem ter origens e classificações diferentes. Para entender o total, é preciso abrir os lançamentos individualmente, verificar quem aparece como doador, qual a natureza declarada da receita e se houve retificações. Uma soma agregada não deve ocultar diferenças entre pessoas físicas, recursos partidários e outras fontes previstas nas regras eleitorais.`,
      `Também é importante distinguir o que foi declarado do que foi analisado ou validado no processo de prestação de contas. O número desta matéria é uma agregação da base disponível no Politica007; ele não representa uma decisão final da Justiça Eleitoral sobre cada lançamento.`,
      `A matéria aponta a fonte oficial para conferência direta e a ficha da candidatura para examinar os registros relacionados. Caso os dados do portal e a prestação mais recente divirjam, consulte o documento atualizado do TSE, que é a fonte primária.`],
    {label:"Receitas declaradas",value:brl(facts.donations.amountCents),detail:`${number(facts.donations.count)} registros · ${facts.donations.year}`},{label:"Prestação de contas · TSE",url:datasetUrl("prestacao",facts.donations.year)});
  if(facts.votes)make("votos","Votação",`Onde apareceram os votos de ${c.name} em ${facts.votes.year}?`,
    `${number(facts.votes.votes)} votos somados em ${number(facts.votes.sections)} seções e ${number(facts.votes.municipalities)} municípios.`,
    [`Os resultados por seção coletados para ${facts.votes.year} somam ${number(facts.votes.votes)} votos para ${c.name}, distribuídos em ${number(facts.votes.sections)} seções eleitorais e ${number(facts.votes.municipalities)} municípios. A soma é calculada a partir das linhas disponíveis para a candidatura na base do portal.`,
      `A distribuição territorial permite ir além do total estadual: o leitor pode consultar em quais municípios, zonas, locais e seções os votos foram registrados, conforme o detalhamento que o TSE publica para aquela eleição. Uma concentração em determinada região descreve o mapa de votação, mas não explica sozinha os motivos do comportamento eleitoral.`,
      `Os totais por seção podem ser afetados pelo cargo, turno, situação da candidatura, atualizações ou recortes territoriais do conjunto de dados. Por isso, diferenças entre um total agregado e uma tabela parcial devem ser conferidas na fonte e no filtro de eleição correspondente.`,
      `O Politica007 organiza os registros para facilitar a consulta e liga a fonte oficial do TSE nesta página. Para comparações entre candidaturas, confirme que ano, cargo, turno e unidade territorial são iguais; comparar recortes diferentes pode levar a conclusões erradas.`],
    {label:"Votos somados por seção",value:number(facts.votes.votes),detail:`${number(facts.votes.sections)} seções · ${facts.votes.year}`},{label:"Resultados por seção · TSE",url:datasetUrl("resultados",facts.votes.year)});
  if(facts.assets)make("bens","Bens declarados",`O que consta na declaração de bens de ${c.name}?`,
    `${number(facts.assets.count)} itens declarados em ${facts.assets.year}; ${brl(facts.assets.amountCents)} somados nos itens com valor informado.`,
    [`A declaração de bens mais recente disponível para ${c.name} foi apresentada em ${facts.assets.year} e contém ${number(facts.assets.count)} itens. ${number(facts.assets.valuedCount)} deles têm valor informado na base, somando ${brl(facts.assets.amountCents)}. O total reproduz a declaração daquele pleito, não uma avaliação patrimonial atual.`,
      `A ficha pode incluir bens de naturezas distintas, como imóveis, veículos, participações ou aplicações. Somá-los ajuda a localizar a ordem de grandeza informada, mas não leva em conta valorização ou desvalorização posterior, dívidas, cotitularidade, liquidez, documentação ou mudanças patrimoniais desde a declaração.`,
      `Valores declarados são informações fornecidas no registro de candidatura e devem ser lidos conforme a descrição de cada item e o ano a que se referem. A ausência de valor em um campo não significa que o item tenha valor zero; indica apenas que não há valor numérico disponível naquele registro coletado.`,
      `Esta matéria não estima riqueza atual nem verifica a titularidade por investigação independente. O conjunto de dados do TSE e a ficha pública permitem consultar as descrições originais e comparar declarações de anos diferentes, preservando o período e a fonte de cada informação.`],
    {label:"Soma declarada",value:brl(facts.assets.amountCents),detail:`${number(facts.assets.valuedCount)} de ${number(facts.assets.count)} itens com valor · ${facts.assets.year}`},{label:"Candidaturas e bens · TSE",url:datasetUrl("candidatos",facts.assets.year)});
  if(!stories.length){
    const candidacy=[c.office,c.party,c.state].filter(Boolean).join(" · ");
    make("candidatura","Candidatura",`A trajetória eleitoral de ${c.name} nos dados públicos`,
      `${candidacy||"Candidatura"} · eleição ${c.year}${c.result?` · ${c.result}`:""}.`,
      [`O registro de candidatura mais recente localizado para ${c.name} é de ${c.year}${candidacy?`, para ${candidacy}`:""}${c.result?`, com resultado informado como “${c.result}”`:""}. Este retrato é limitado às eleições e aos campos publicados e coletados para o período.`,
        `Os dados de candidatura organizam informações como cargo, partido, unidade eleitoral e situação eleitoral. Cada campo responde a uma pergunta específica e pode ser atualizado por decisões, retificações ou novos registros. O resultado indicado refere-se à eleição daquele ano, não antecipa participação ou desempenho em outro pleito.`,
        `O histórico permite acompanhar mudanças entre eleições, mas diferenças de cargo ou localidade pedem cuidado: uma candidatura municipal não deve ser comparada diretamente com uma disputa estadual ou nacional sem considerar a escala e as regras de cada eleição.`,
        `A fonte oficial do TSE e a ficha detalhada da pessoa estão ligadas nesta página. Consulte o registro completo para confirmar os dados, as datas e o contexto antes de tirar conclusões sobre a trajetória política.`],
      {label:"Registro mais recente",value:String(c.year),detail:candidacy||"Cargo, partido e unidade eleitoral não informados"},{label:"Candidaturas · TSE",url:datasetUrl("candidatos",c.year)});
  }
  return stories;
}

function readStored(row:{day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined):DailyNewsFeed|null{
  if(!row)return null;
  try{
    // A saved edition is an immutable snapshot. Re-querying every candidate's
    // financial, electoral, and process records on each page view makes this
    // synchronous SQLite route block the whole Next.js server process.
    const articles=JSON.parse(row.payload) as DailyNewsArticle[];
    return {day:row.day,generatedAt:row.generated_at,trackedProfiles:row.tracked_profiles,articles};
  }catch{return null;}
}

export function getDailyNews(day=saoPauloDay()):DailyNewsFeed{
  const store=platformStore();
  const stored=store.prepare("SELECT day,payload,generated_at,(SELECT count(DISTINCT person_id) FROM candidate_profile_access_daily WHERE day>=? AND day<=?) AS tracked_profiles FROM daily_news WHERE day=?").get(daysBefore(day,29),day,day) as {day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined;
  if(stored)return readStored(stored)!;
  const since=daysBefore(day,29);
  const popular=store.prepare("SELECT person_id AS personId,sum(views) AS views FROM candidate_profile_access_daily WHERE day>=? AND day<=? GROUP BY person_id ORDER BY views DESC,person_id LIMIT 40").all(since,day) as PopularProfile[];
  const trackedProfiles=popular.length;
  const generatedAt=new Date().toISOString();
  const openingEdition=day===openingEditionDay?[openingEditionArticle(generatedAt)]:[];
  if(!popular.length&&!openingEdition.length){
    if(day===saoPauloDay())return {day,generatedAt:null,trackedProfiles:0,articles:[]};
    store.prepare("INSERT OR IGNORE INTO daily_news(day,payload,generated_at) VALUES(?,?,?)").run(day,"[]",generatedAt);
    const empty=store.prepare("SELECT day,payload,generated_at,(SELECT count(DISTINCT person_id) FROM candidate_profile_access_daily WHERE day>=? AND day<=?) AS tracked_profiles FROM daily_news WHERE day=?").get(since,day,day) as {day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined;
    return readStored(empty)!;
  }
  const candidates=popular.map(x=>getCandidateFacts(x.personId,x.views)).filter((x):x is StoryFacts=>x!==null);
  const storyLists=candidates.map(x=>topicStories(x,generatedAt));const articles:DailyNewsArticle[]=[...openingEdition];
  for(let topic=0;articles.length<5;topic++){
    let added=false;
    for(const list of storyLists){if(list[topic]&& !openingEdition.some(article=>article.personId===list[topic].personId)){articles.push(list[topic]);added=true;if(articles.length===5)break;}}
    if(!added)break;
  }
  if(!articles.length)return {day,generatedAt:null,trackedProfiles,articles:[]};
  const encoded=JSON.stringify(articles);
  const insert=store.prepare("INSERT OR IGNORE INTO daily_news(day,payload,generated_at) VALUES(?,?,?)");
  store.transaction(()=>insert.run(day,encoded,generatedAt))();
  const final=store.prepare("SELECT day,payload,generated_at,(SELECT count(DISTINCT person_id) FROM candidate_profile_access_daily WHERE day>=? AND day<=?) AS tracked_profiles FROM daily_news WHERE day=?").get(since,day,day) as {day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined;
  return readStored(final)!;
}

export function getDailyNewsEdition(day:string):DailyNewsFeed|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
  const timestamp=Date.parse(`${day}T12:00:00Z`);
  if(!Number.isFinite(timestamp)||new Date(timestamp).toISOString().slice(0,10)!==day||day>saoPauloDay())return null;
  return getDailyNews(day);
}

export function getPreviousNewsEditionDay(day=saoPauloDay()):string{return daysBefore(day,1);}

export function getDailyNewsArchive(before=saoPauloDay(),limit=14):DailyNewsArchiveEntry[]{
  const boundedLimit=Number.isSafeInteger(limit)?Math.max(1,Math.min(limit,60)):14;
  const rows=platformStore().prepare("SELECT day,payload,generated_at FROM daily_news WHERE day<? ORDER BY day DESC LIMIT ?").all(before,boundedLimit) as Array<{day:string;payload:string;generated_at:string}>;
  return rows.flatMap(row=>{try{return [{day:row.day,generatedAt:row.generated_at,articleCount:(JSON.parse(row.payload) as DailyNewsArticle[]).length}];}catch{return [];}});
}

export const getStoredNewsArticle=cache((day:string,slug:string):DailyNewsArticle|null=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^p\d+(-[a-z0-9-]+)?$/.test(slug))return null;
  const row=platformStore().prepare("SELECT payload FROM daily_news WHERE day=?").get(day) as {payload:string}|undefined;
  if(!row)return null;
  try{
    const articles=JSON.parse(row.payload) as DailyNewsArticle[];
    const index=articles.findIndex(article=>article.slug===slug);
    return index<0?null:articles[index];
  }catch{return null;}
});

/**
 * Resolve a saved story first, then rebuild it from the public source tables.
 * The news feed and detail route can land on different app instances, while
 * daily_news lives in the lightweight platform store. A missing replica-local
 * copy must not turn a link that was just shown in /news into a 404.
 */
export const getNewsArticle=cache((day:string,slug:string):DailyNewsArticle|null=>{
  const stored=getStoredNewsArticle(day,slug);
  if(stored)return stored;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^p(\d+)-([a-z0-9-]+)$/.test(slug))return null;
  const dayTime=Date.parse(`${day}T12:00:00Z`);
  if(!Number.isFinite(dayTime)||new Date(dayTime).toISOString().slice(0,10)!==day)return null;
  if(day===openingEditionDay&&slug===openingArticleSlug)return openingEditionArticle(new Date(`${day}T00:05:00-03:00`).toISOString());
  const personId=Number(/^p(\d+)-/.exec(slug)?.[1]);
  if(!Number.isSafeInteger(personId)||personId<1)return null;
  const facts=getCandidateFacts(personId,0);
  if(!facts)return null;
  const publishedAt=new Date(`${day}T00:05:00-03:00`).toISOString();
  return topicStories(facts,publishedAt).find(article=>article.slug===slug)||null;
});

function daysBefore(day:string,days:number):string{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
