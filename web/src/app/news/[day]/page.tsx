import Link from "next/link";
import {ArrowLeft,ArrowUpRight,Newspaper} from "lucide-react";
import {notFound} from "next/navigation";
import {PageHeader} from "@/components/shell/shell-context";
import {NewsArticleGrid} from "@/components/news-article-card";
import {getDailyNewsEdition,getDailyNewsArchive} from "@/lib/platform/news";

export const dynamic="force-dynamic";
export const metadata={title:"Arquivo de notícias · Politica007",description:"Consulte edições anteriores e matérias públicas salvas no Politica007."};

function dateLabel(day:string){return new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long",year:"numeric"});}
function timeLabel(value:string|null){if(!value)return null;return new Date(value).toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"});}

export default async function NewsEditionPage({params}:{params:Promise<{day:string}>}){
  const {day}=await params;
  const feed=await getDailyNewsEdition(day);
  if(!feed)notFound();
  const previousEditions=getDailyNewsArchive(day,14);
  return <main className="news-page">
    <PageHeader group="Notícias" current="Arquivo"/>
    <Link className="news-back" href="/news"><ArrowLeft size={15}/> Voltar à edição de hoje</Link>
    <section className="news-masthead">
      <div className="news-masthead__copy">
        <span className="news-eyebrow"><Newspaper size={15}/> ARQUIVO DE NOTÍCIAS</span>
        <h1>Matérias de {dateLabel(feed.day)}.</h1>
        <p>Esta edição fica guardada para consulta. Cada matéria mantém seus dados e links para conferir as fontes.</p>
      </div>
      <div className="news-edition"><span>EDIÇÃO ARQUIVADA</span><strong>{dateLabel(feed.day)}</strong><small>{feed.articles.length} {feed.articles.length===1?"matéria":"matérias"}{timeLabel(feed.generatedAt)?` · salva às ${timeLabel(feed.generatedAt)}`:""}</small></div>
    </section>
    {feed.articles.length?<NewsArticleGrid articles={feed.articles} day={feed.day} label={`Matérias de ${dateLabel(feed.day)}`}/>:<section className="news-empty"><span className="news-empty__icon"><Newspaper size={20}/></span><h2>Nenhuma matéria nesta edição</h2><p>Não havia registros suficientes para montar uma pauta verificável nesta data. Esta edição vazia também fica salva para consulta futura.</p><Link href="/news" className="btn btn--primary">Ver edição de hoje</Link></section>}
    {previousEditions.length>0&&<section className="news-archive" aria-label="Edições anteriores"><div><span>ARQUIVO</span><h2>Datas anteriores</h2><p>Continue a consulta por outras edições salvas.</p></div><ul>{previousEditions.map(entry=><li key={entry.day}><Link href={`/news/${entry.day}`}><time dateTime={entry.day}>{dateLabel(entry.day)}</time><span>{entry.articleCount?`${entry.articleCount} matérias`:"Edição sem matérias"}</span><ArrowUpRight size={15}/></Link></li>)}</ul></section>}
  </main>;
}
