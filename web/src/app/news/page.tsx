import Link from "next/link";
import {ArrowUpRight,Newspaper,Search} from "lucide-react";
import {PageHeader} from "@/components/shell/shell-context";
import {NewsArticleGrid} from "@/components/news-article-card";
import {getDailyNews,getDailyNewsArchive,getPreviousNewsEditionDay} from "@/lib/platform/news";

export const dynamic="force-dynamic";
export const metadata={title:"Notícias dos dados públicos · Politica007",description:"Matérias sobre registros eleitorais, processos e prestações de contas, com contexto, comparações identificadas e links para fontes."};

function dateLabel(day:string){return new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long",year:"numeric"});}
function timeLabel(value:string|null){if(!value)return null;return new Date(value).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});}

export default function NewsPage(){
  const feed=getDailyNews();
  const previousDay=getPreviousNewsEditionDay(feed.day);
  const archives=getDailyNewsArchive(feed.day,14);
  if(!archives.some(entry=>entry.day===previousDay))archives.unshift({day:previousDay,generatedAt:"",articleCount:0});
  return <main className="news-page">
    <PageHeader group="Informação pública" current="Notícias"/>
    <section className="news-masthead">
      <div className="news-masthead__copy">
        <span className="news-eyebrow"><Newspaper size={15}/> RADAR DE DADOS PÚBLICOS</span>
        <h1>Notícias que partem dos dados.</h1>
        <p>Matérias sobre candidaturas, processos eleitorais, despesas e outros registros públicos, com contexto, dados de comparação e links para conferir as fontes.</p>
      </div>
      <div className="news-edition"><span>EDIÇÃO DE HOJE</span><strong>{dateLabel(feed.day)}</strong><small>Até 5 matérias · geradas uma vez ao dia{timeLabel(feed.generatedAt)?` · ${timeLabel(feed.generatedAt)}`:""}</small></div>
    </section>
    <div className="news-editorial-note"><span className="news-editorial-note__dot"/><p>Os textos são montados a partir de registros identificados e links oficiais. Um processo não significa culpa; um alerta de gasto não comprova irregularidade. Leia os documentos e o contexto antes de compartilhar.</p></div>
    {feed.articles.length?<NewsArticleGrid articles={feed.articles} day={feed.day} label="Matérias de hoje"/>:<section className="news-empty">
      <span className="news-empty__icon"><Search size={20}/></span>
      <h2>{feed.trackedProfiles?"Estamos conferindo os registros desta edição.":"Ainda não há matérias disponíveis nesta edição."}</h2>
      <p>{feed.trackedProfiles?"As informações estão sendo organizadas com os respectivos links de origem. Volte em instantes.":"Novas matérias aparecem quando há registros públicos que podem ser apresentados com fonte e contexto suficientes."}</p>
      <Link href="/" className="btn btn--primary">Pesquisar candidatos e dados</Link>
    </section>}
    {archives.length>0&&<section className="news-archive" aria-label="Edições anteriores"><div><span>ARQUIVO</span><h2>Edições anteriores</h2><p>Matérias guardadas para consulta, organizadas por data.</p></div><ul>{archives.map(entry=><li key={entry.day}><Link href={`/news/${entry.day}`}><time dateTime={entry.day}>{dateLabel(entry.day)}</time><span>{entry.articleCount?`${entry.articleCount} matérias`:"Abrir edição"}</span><ArrowUpRight size={15}/></Link></li>)}</ul></section>}
    <footer className="news-methodology"><strong>Como ler estas matérias</strong><p>Os fatos e valores são acompanhados por links para os registros de origem. Comparações estatísticas e referências comerciais são identificadas separadamente e incluem seus limites; quando faltam quantidade ou especificações equivalentes, elas não permitem concluir que um preço esteja acima do mercado. Processos, alertas e diferenças estatísticas não comprovam culpa ou irregularidade.</p><Link href="/fontes">Ver fontes e atualizações do portal <ArrowUpRight size={14}/></Link></footer>
  </main>;
}
