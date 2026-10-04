import Link from "next/link";
import {ArrowLeft,ArrowUpRight,ExternalLink,Newspaper} from "lucide-react";
import {notFound} from "next/navigation";
import {PageHeader} from "@/components/shell/shell-context";
import {NewsShareActions} from "@/components/news-share-actions";
import {getStoredNewsArticle} from "@/lib/platform/news";
import {shareMetadata} from "@/lib/platform/share";

type Params={params:Promise<{day:string;slug:string}>};
export async function generateMetadata({params}:Params){const {day,slug}=await params;const article=getStoredNewsArticle(day,slug);return article?shareMetadata(article.title,`/news/${day}/${slug}`,article.summary):{title:"Notícia não encontrada · Politica007"};}

export default async function NewsArticlePage({params}:Params){
  const {day,slug}=await params;const article=getStoredNewsArticle(day,slug);if(!article)notFound();
  const published=new Date(article.publishedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"long",timeStyle:"short"});
  return <main className="news-article-page">
    <PageHeader group="Notícias" current={article.personName}/>
    <Link className="news-back" href="/news"><ArrowLeft size={15}/> Voltar às notícias</Link>
    <article className="news-article">
      <div className="news-article__eyebrow"><Newspaper size={15}/><span>{article.category}</span><span>·</span><time dateTime={article.publishedAt}>{published}</time></div>
      <h1>{article.title}</h1>
      <p className="news-article__summary">{article.summary}</p>
      <div className="news-article__byline"><span>Matéria automatizada do Politica007</span><Link href={`/politico/${article.personId}`}>Ver ficha de {article.personName}<ArrowUpRight size={14}/></Link></div>
      <div className="news-article__body">{article.body.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
      <div className="news-article__facts"><h2>Dados em destaque</h2>{article.highlights.map((fact,index)=><div className="news-article__fact" key={`${fact.label}-${index}`}><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.detail}</small></div>)}</div>
      <section className="news-article__sources"><h2>Confira nas fontes oficiais</h2>{article.sources.map((item,index)=><a href={item.url} key={`${item.url}-${index}`} target="_blank" rel="noopener noreferrer"><span>{item.label}</span><ExternalLink size={15}/></a>)}</section>
      <div className="news-article__notice"><strong>Leia o contexto antes de concluir</strong><p>Esta matéria organiza registros públicos para facilitar a consulta. A existência de processo, diferença estatística ou despesa atípica não prova crime ou irregularidade. Consulte os documentos oficiais e o andamento atualizado.</p></div>
      <section className="news-article__share"><div><span>ESPALHE A INFORMAÇÃO COM A FONTE</span><h2>Compartilhe esta matéria</h2><p>O link abre esta notícia no Politica007 e mantém as fontes oficiais ao alcance.</p></div><NewsShareActions title={article.title}/></section>
    </article>
  </main>;
}
