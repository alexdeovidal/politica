import Link from "next/link";
import {ArrowUpRight,Newspaper,Search} from "lucide-react";
import {PageHeader} from "@/components/shell/shell-context";
import {NewsStoryCover} from "@/components/news-story-cover";
import {getDailyNews} from "@/lib/platform/news";

export const dynamic="force-dynamic";
export const metadata={title:"Notícias dos dados públicos · Politica007",description:"Matérias automáticas sobre registros eleitorais, processos, prestações de contas e candidatos mais consultados, com links para fontes oficiais."};

function dateLabel(day:string){return new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long",year:"numeric"});}
function timeLabel(value:string|null){if(!value)return null;return new Date(value).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});}

export default function NewsPage(){
  const feed=getDailyNews();
  const hasOpeningEdition=feed.articles.some(article=>article.category==="Pauta especial de estreia");
  return <main className="news-page">
    <PageHeader group="Informação pública" current="Notícias"/>
    <section className="news-masthead">
      <div className="news-masthead__copy">
        <span className="news-eyebrow"><Newspaper size={15}/> RADAR DE DADOS PÚBLICOS</span>
        <h1>Notícias que partem dos dados.</h1>
        <p>Matérias sobre candidaturas, processos eleitorais, despesas e outros registros públicos. {hasOpeningEdition?"A edição de estreia traz uma pauta verificada; as próximas serão priorizadas pelos perfis mais consultados.":"As edições diárias são priorizadas pelos perfis mais consultados no Politica007."}</p>
      </div>
      <div className="news-edition"><span>EDIÇÃO DE HOJE</span><strong>{dateLabel(feed.day)}</strong><small>Até 5 matérias · geradas uma vez ao dia{timeLabel(feed.generatedAt)?` · ${timeLabel(feed.generatedAt)}`:""}</small></div>
    </section>
    <div className="news-editorial-note"><span className="news-editorial-note__dot"/><p>Os textos são montados a partir de registros identificados e links oficiais. Um processo não significa culpa; um alerta de gasto não comprova irregularidade. Leia os documentos e o contexto antes de compartilhar.</p></div>
    {feed.articles.length?<section className="news-grid" aria-label="Matérias de hoje">
      {feed.articles.map((article,index)=><article className={`news-card${index===0?" news-card--lead":""}`} key={article.slug}>
        <Link className="news-card__cover-link" href={`/news/${feed.day}/${article.slug}`} aria-label={`Abrir matéria: ${article.title}`}><NewsStoryCover article={article}/></Link>
        <div className="news-card__top"><span className="news-card__category">{article.category}</span><time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"short"})}</time></div>
        <h2><Link href={`/news/${feed.day}/${article.slug}`}>{article.title}</Link></h2>
        <p className="news-card__summary">{article.summary}</p>
        <div className="news-card__fact"><span>{article.highlights[0]?.label}</span><strong>{article.highlights[0]?.value}</strong><small>{article.highlights[0]?.detail}</small></div>
        <div className="news-card__footer"><Link href={`/politico/${article.personId}`}>{article.personName}<ArrowUpRight size={14}/></Link><Link className="news-card__read" href={`/news/${feed.day}/${article.slug}`}>Ler matéria <ArrowUpRight size={15}/></Link></div>
      </article>)}
    </section>:<section className="news-empty">
      <span className="news-empty__icon"><Search size={20}/></span>
      <h2>{feed.trackedProfiles?"Estamos conferindo os registros para as primeiras pautas.":"As primeiras pautas começam pelas fichas mais consultadas."}</h2>
      <p>{feed.trackedProfiles?"Ainda não há matéria pronta para esta edição. Acompanhe em instantes.":"O sistema contabiliza de forma agregada as consultas aos perfis. Quando houver consultas suficientes, ele seleciona até cinco candidatos por dia e verifica processos, despesas comparativas e outros dados disponíveis."}</p>
      <Link href="/" className="btn btn--primary">Pesquisar candidatos e dados</Link>
    </section>}
    <footer className="news-methodology"><strong>Como estas matérias são selecionadas</strong><p>{hasOpeningEdition?"A pauta especial de estreia foi escolhida editorialmente a partir de registros oficiais. Nas edições seguintes, os perfis serão ordenados pela quantidade agregada de consultas nos últimos 30 dias, limitada a uma contagem diária por navegador e candidato.":"Os perfis são ordenados pela quantidade agregada de consultas nos últimos 30 dias, limitada a uma contagem diária por navegador e candidato."} Não armazenamos quem fez a consulta. O conteúdo usa fatos estruturados nas bases públicas do TSE e apresenta a fonte junto de cada pauta; sinais automatizados são identificados como sinais, sem conclusão de irregularidade.</p><Link href="/fontes">Ver fontes e atualizações do portal <ArrowUpRight size={14}/></Link></footer>
  </main>;
}
