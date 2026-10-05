import {db,hasTable} from "@/lib/db";
import {platformStore} from "@/lib/platform/store";

export type NewsSource={label:string;url:string};
export type NewsHighlight={label:string;value:string;detail:string};
export type DailyNewsArticle={
  slug:string;personId:number;personName:string;title:string;summary:string;category:string;
  publishedAt:string;body:string[];highlights:NewsHighlight[];sources:NewsSource[];
};
export type DailyNewsFeed={day:string;generatedAt:string|null;trackedProfiles:number;articles:DailyNewsArticle[]};

const openingEditionDay="2026-10-04";
const openingArticleSlug="p28350-adesivos-estreia";

function openingEditionArticle(publishedAt:string):DailyNewsArticle{
  return {
    slug:openingArticleSlug,personId:28350,personName:"Flávio Nantes Bolsonaro",
    title:"TSE lista R$ 766 mil em dois lançamentos de adesivos da campanha de Flávio Bolsonaro",
    summary:"Um registro descreve adesivo de vinil por R$ 396 mil e outro, adesivo perfurado por R$ 370 mil. Os seis lançamentos da categoria somam R$ 965,5 mil.",
    category:"Pauta especial de estreia",publishedAt,
    body:[
      "Na prestação de contas de candidatos de 2026 publicada pelo Tribunal Superior Eleitoral, dois lançamentos associados à campanha de Flávio Nantes Bolsonaro descrevem materiais adesivos: R$ 396 mil para “adesivo para choque em vinil — presidente Flávio Bolsonaro — 100x300mm” e R$ 370 mil para “adesivo perfurado — Flavio Bolsonaro Presidente 22”. Juntos, os registros somam R$ 766 mil.",
      "Nos dados classificados pelo Politica007 como adesivos, há seis lançamentos que totalizam R$ 965.496. Os dois citados representam cerca de 79,3% desse total. A categoria corresponde a 1,6% das receitas associadas à candidatura; a média calculada para nove candidaturas do mesmo cargo e unidade eleitoral, com receita informada, é 3,6%.",
      "O sistema marca os valores individuais para conferência por comparação estatística. Essa diferença não comprova irregularidade: quantidade, dimensões, compra em lote, documentação fiscal e outros detalhes precisam ser analisados junto aos registros completos. Os valores são lançamentos declarados, não uma conclusão do TSE sobre a regularidade das despesas.",
      "Esta pauta de estreia foi preparada a partir dos dados públicos do TSE e de cálculos comparativos do Politica007. Consulte o conjunto original e a ficha da candidatura antes de compartilhar conclusões.",
    ],
    highlights:[{label:"Dois lançamentos destacados",value:"R$ 766.000,00",detail:"R$ 396.000 em adesivo de vinil + R$ 370.000 em adesivo perfurado · 2026"}],
    sources:[{label:"Prestação de contas eleitorais de 2026 · TSE",url:"https://dadosabertos.tse.jus.br/pt_BR/dataset/prestacao-de-contas-eleitorais-2026"}],
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

function topicStories(facts:StoryFacts,publishedAt:string,includePopularityNote=true):DailyNewsArticle[]{
  const {candidate:c}=facts;const stories:DailyNewsArticle[]=[];
  const make=(slugPart:string,category:string,title:string,summary:string,body:string,highlight:NewsHighlight,sourceItem:NewsSource)=>stories.push({
    slug:`p${c.id}-${slugPart}`,personId:c.id,personName:c.name,title,summary,category,publishedAt,
    body:[body,"Esta matéria é produzida automaticamente a partir dos registros indicados. Ela não substitui a leitura do documento original."],highlights:[highlight],sources:[sourceItem],
  });
  const caseSource=(facts.recentProcess&&source("Processos eleitorais · TSE",facts.recentProcess.sourceUrl))||{label:"Processos eleitorais · base oficial do TSE",url:datasetUrl("processual",facts.recentProcess?.year||c.year)};
  const signalSource=(signal:StoryFacts["signals"][number])=>source("Prestação de contas · registro de despesa",signal.sourceUrl)||{label:"Prestação de contas eleitorais · TSE",url:datasetUrl("prestacao",signal.year)};
  // Pautas com possível interesse público vêm primeiro; o texto preserva a distinção entre registro, sinal e conclusão.
  for(const [index,signal] of facts.signals.entries()){
    make(`despesa-${index+1}`,"Alerta comparativo",`Sinal comparativo destaca despesa de ${brl(signal.amountCents)} na campanha de ${c.name}`,
      `${signal.description||"Despesa de campanha"} · ${signal.year}. O alerta compara valores; não afirma que houve irregularidade.`,
      `${signal.explanation} A própria regra descreve hipóteses como compra em lote, descrição pouco detalhada ou erro de digitação. O sinal é um ponto para conferência, não comprova irregularidade.`,
      {label:"Valor registrado",value:brl(signal.amountCents),detail:`${signal.description||"Descrição não informada"} · ${signal.year}`},signalSource(signal));
  }
  if(facts.processCount){
    const p=facts.recentProcess;const status=p?.closedAt?`A base informa encerramento em ${p.closedAt}.` : "A base não traz data de encerramento; isso não confirma que o processo continue ativo hoje.";
    const lastDecision=p?.lastDecisionType?` Última decisão listada: ${p.lastDecisionType}${p.lastDecisionAt?` (${p.lastDecisionAt})`:""}.`:"";
    make("processos","Processos eleitorais",`${number(facts.processCount)} processo${facts.processCount===1?"":"s"} eleitoral${facts.processCount===1?"":"is"} ligado${facts.processCount===1?"":"s"} ao registro de ${c.name}`,
      `${number(facts.openProcessCount)} processo${facts.openProcessCount===1?"":"s"} sem data de encerramento preenchida na base. Processo não significa culpa ou condenação.`,
      `A base pública do TSE relaciona ${number(facts.processCount)} processo${facts.processCount===1?"":"s"} eleitoral${facts.processCount===1?"":"is"} a registros de candidatura associados a ${c.name}. O mais recente listado é o processo ${p?.number||"sem número disponível"}${p?.className?`, classe ${p.className}`:""}${p?.subject?`, assunto principal “${p.subject}”`:""}${p?.pole?`, posição no processo: ${p.pole}`:""}. ${status}${lastDecision} A associação processual não significa condenação nem comprova irregularidade; consulte o andamento e as decisões na fonte oficial.`,
      {label:"Processos eleitorais associados",value:number(facts.processCount),detail:`${number(facts.openProcessCount)} sem data de encerramento na base; situação atual deve ser conferida no tribunal.`},caseSource);
  }
  if(facts.expenses)make("despesas","Prestação de contas",`Quanto a campanha de ${c.name} declarou em despesas?`,
    `${brl(facts.expenses.amountCents)} em ${number(facts.expenses.count)} registros de ${facts.expenses.year}.`,
    `Os registros de despesas vinculados à conta de campanha de ${c.name} somam ${brl(facts.expenses.amountCents)} em ${facts.expenses.year}, distribuídos em ${number(facts.expenses.count)} despesas contratadas. O valor contratado não deve ser tratado automaticamente como valor pago, aprovado ou irregular; os documentos e pagamentos podem ser consultados nos registros oficiais.`,
    {label:"Despesas contratadas",value:brl(facts.expenses.amountCents),detail:`${number(facts.expenses.count)} registros · ${facts.expenses.year}`},{label:"Prestação de contas · TSE",url:datasetUrl("prestacao",facts.expenses.year)});
  if(facts.donations)make("receitas","Prestação de contas",`Receitas declaradas pela campanha de ${c.name} somam ${brl(facts.donations.amountCents)}`,
    `${number(facts.donations.count)} registros de receitas na eleição de ${facts.donations.year}.`,
    `Os registros de receitas vinculados à conta de campanha de ${c.name} somam ${brl(facts.donations.amountCents)} em ${facts.donations.year}, distribuídos em ${number(facts.donations.count)} lançamentos. A soma reflete os registros coletados; confira a discriminação e a situação da prestação na fonte oficial.`,
    {label:"Receitas declaradas",value:brl(facts.donations.amountCents),detail:`${number(facts.donations.count)} registros · ${facts.donations.year}`},{label:"Prestação de contas · TSE",url:datasetUrl("prestacao",facts.donations.year)});
  if(facts.votes)make("votos","Votação",`Onde apareceram os votos de ${c.name} em ${facts.votes.year}?`,
    `${number(facts.votes.votes)} votos somados em ${number(facts.votes.sections)} seções e ${number(facts.votes.municipalities)} municípios.`,
    `A base de resultados por seção do Politica007 soma ${number(facts.votes.votes)} votos registrados em ${number(facts.votes.sections)} seções eleitorais de ${number(facts.votes.municipalities)} municípios no pleito de ${facts.votes.year}. Consulte o mapa e a distribuição por local na ficha; os totais refletem as seções disponíveis na fonte coletada.`,
    {label:"Votos somados por seção",value:number(facts.votes.votes),detail:`${number(facts.votes.sections)} seções · ${facts.votes.year}`},{label:"Resultados por seção · TSE",url:datasetUrl("resultados",facts.votes.year)});
  if(facts.assets)make("bens","Bens declarados",`O que consta na declaração de bens de ${c.name}?`,
    `${number(facts.assets.count)} itens declarados em ${facts.assets.year}; ${brl(facts.assets.amountCents)} somados nos itens com valor informado.`,
    `A declaração mais recente disponível no TSE contém ${number(facts.assets.count)} itens em ${facts.assets.year}. Os ${number(facts.assets.valuedCount)} itens com valor informado somam ${brl(facts.assets.amountCents)}. Trata-se do que foi declarado naquela eleição, não de uma avaliação atual do patrimônio.`,
    {label:"Soma declarada",value:brl(facts.assets.amountCents),detail:`${number(facts.assets.valuedCount)} de ${number(facts.assets.count)} itens com valor · ${facts.assets.year}`},{label:"Candidaturas e bens · TSE",url:datasetUrl("candidatos",facts.assets.year)});
  if(!stories.length){
    const candidacy=[c.office,c.party,c.state].filter(Boolean).join(" · ");
    make("candidatura","Candidatura",`A trajetória eleitoral de ${c.name} nos dados públicos`,
      `${candidacy||"Candidatura"} · eleição ${c.year}${c.result?` · ${c.result}`:""}.`,
      `O registro oficial de candidatura mais recente disponível na base é de ${c.year}, para ${candidacy||"cargo não informado"}${c.result?`, com resultado publicado como “${c.result}”`:""}. A ficha reúne o histórico eleitoral conhecido e permite conferir os campos na fonte do TSE.`,
      {label:"Registro mais recente",value:String(c.year),detail:candidacy||"Cargo, partido e unidade eleitoral não informados"},{label:"Candidaturas · TSE",url:datasetUrl("candidatos",c.year)});
  }
  return includePopularityNote?stories.map(s=>({...s,summary:`${s.summary} Pauta escolhida entre os perfis mais consultados no Politica007 nos últimos 30 dias.`})):stories;
}

function readStored(row:{day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined):DailyNewsFeed|null{
  if(!row)return null;try{return {day:row.day,generatedAt:row.generated_at,trackedProfiles:row.tracked_profiles,articles:JSON.parse(row.payload) as DailyNewsArticle[]};}catch{return null;}
}

export function getDailyNews(day=saoPauloDay()):DailyNewsFeed{
  const store=platformStore();
  const stored=store.prepare("SELECT day,payload,generated_at,(SELECT count(DISTINCT person_id) FROM candidate_profile_access_daily WHERE day>=?) AS tracked_profiles FROM daily_news WHERE day=?").get(daysBefore(day,29),day) as {day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined;
  if(stored)return readStored(stored)!;
  const since=daysBefore(day,29);
  const popular=store.prepare("SELECT person_id AS personId,sum(views) AS views FROM candidate_profile_access_daily WHERE day>=? AND day<=? GROUP BY person_id ORDER BY views DESC,person_id LIMIT 40").all(since,day) as PopularProfile[];
  const trackedProfiles=popular.length;
  const generatedAt=new Date().toISOString();
  const openingEdition=day===openingEditionDay?[openingEditionArticle(generatedAt)]:[];
  if(!popular.length&&!openingEdition.length)return {day,generatedAt:null,trackedProfiles:0,articles:[]};
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
  const final=store.prepare("SELECT day,payload,generated_at,(SELECT count(DISTINCT person_id) FROM candidate_profile_access_daily WHERE day>=?) AS tracked_profiles FROM daily_news WHERE day=?").get(since,day) as {day:string;payload:string;generated_at:string;tracked_profiles:number}|undefined;
  return readStored(final)!;
}

export function getStoredNewsArticle(day:string,slug:string):DailyNewsArticle|null{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^p\d+(-[a-z0-9-]+)?$/.test(slug))return null;
  const row=platformStore().prepare("SELECT payload FROM daily_news WHERE day=?").get(day) as {payload:string}|undefined;
  if(!row)return null;try{return (JSON.parse(row.payload) as DailyNewsArticle[]).find(x=>x.slug===slug)||null;}catch{return null;}
}

/**
 * Resolve a saved story first, then rebuild it from the public source tables.
 * The news feed and detail route can land on different app instances, while
 * daily_news lives in the lightweight platform store. A missing replica-local
 * copy must not turn a link that was just shown in /news into a 404.
 */
export function getNewsArticle(day:string,slug:string):DailyNewsArticle|null{
  const stored=getStoredNewsArticle(day,slug);
  if(stored)return stored;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!/^p(\d+)-([a-z0-9-]+)$/.test(slug))return null;
  if(day===openingEditionDay&&slug===openingArticleSlug)return openingEditionArticle(new Date(`${day}T00:05:00-03:00`).toISOString());
  const personId=Number(/^p(\d+)-/.exec(slug)?.[1]);
  if(!Number.isSafeInteger(personId)||personId<1)return null;
  const facts=getCandidateFacts(personId,0);
  if(!facts)return null;
  const publishedAt=new Date(`${day}T00:05:00-03:00`).toISOString();
  return topicStories(facts,publishedAt,false).find(article=>article.slug===slug)||null;
}

function daysBefore(day:string,days:number):string{const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
