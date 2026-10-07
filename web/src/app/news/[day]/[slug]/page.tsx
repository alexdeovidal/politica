import Link from "next/link";
import {ArrowLeft,ArrowUpRight,ExternalLink,Newspaper,Store} from "lucide-react";
import {notFound} from "next/navigation";
import {PageHeader} from "@/components/shell/shell-context";
import {NewsShareActions} from "@/components/news-share-actions";
import {NewsArticleImage} from "@/components/news-article-image";
import {NewsStoryCover,OPENING_NEWS_SLUG} from "@/components/news-story-cover";
import {getNewsArticle} from "@/lib/platform/news";
import {shareMetadata} from "@/lib/platform/share";

type Params={params:Promise<{day:string;slug:string}>};
export async function generateMetadata({params}:Params){const {day,slug}=await params;const article=await getNewsArticle(day,slug);return article?shareMetadata(article.title,`/news/${day}/${slug}`,article.summary):{title:"Notícia não encontrada · Politica007"};}

export default async function NewsArticlePage({params}:Params){
  const {day,slug}=await params;const article=await getNewsArticle(day,slug);if(!article)notFound();
  const published=new Date(article.publishedAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"long",timeStyle:"short"});
  return <main className="news-article-page">
    <PageHeader group="Notícias" current={article.personName}/>
    <Link className="news-back" href={`/news/${day}`}><ArrowLeft size={15}/> Voltar à edição de {new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"numeric",month:"long"})}</Link>
    <article className="news-article">
      <div className="news-article__eyebrow"><Newspaper size={15}/><span>{article.category}</span><span>·</span><time dateTime={article.publishedAt}>{published}</time></div>
      {article.slug===OPENING_NEWS_SLUG&&<NewsStoryCover article={article}/>}
      {article.slug!==OPENING_NEWS_SLUG&&<NewsArticleImage day={day} article={article} priority/>}
      <h1>{article.title}</h1>
      <p className="news-article__summary">{article.summary}</p>
      <div className="news-article__byline"><span>Matéria automatizada do Politica007</span><Link href={`/politico/${article.personId}`}>Ver ficha de {article.personName}<ArrowUpRight size={14}/></Link></div>
      <div className="news-article__body">{article.body.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>
      {article.marketComparisons?.length?<section className="news-article__market"><div className="news-article__market-heading"><Store size={18}/><div><h2>Referências de preço em fornecedores</h2><p>Preços publicados em páginas comerciais para dar contexto. São produtos e condições diferentes, não cotações da campanha.</p></div></div><div className="news-article__market-grid">{article.marketComparisons.map((item,index)=><article className="news-article__market-card" key={`${item.supplier}-${index}`}><span>{item.supplier} · consultado em {new Date(`${item.checkedAt}T12:00:00-03:00`).toLocaleDateString("pt-BR")}</span><h3>{item.product}</h3><strong>{item.price}<small> / {item.unit}</small></strong><p>{item.note}</p><a href={item.url} target="_blank" rel="noopener noreferrer">Ver anúncio e condições <ExternalLink size={14}/></a></article>)}</div><p className="news-article__market-caveat">Anúncios podem mudar e não comprovam equivalência de quantidade, qualidade, acabamento, prazo, entrega ou serviço. Sem uma unidade e especificações comparáveis no registro eleitoral, não é possível calcular sobrepreço nem concluir irregularidade a partir destes valores.</p></section>:null}
      <div className="news-article__facts"><h2>Dados em destaque</h2>{article.highlights.map((fact,index)=><div className="news-article__fact" key={`${fact.label}-${index}`}><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.detail}</small></div>)}</div>
      <section className="news-article__sources"><h2>Confira nas fontes oficiais</h2>{article.sources.map((item,index)=><a href={item.url} key={`${item.url}-${index}`} target="_blank" rel="noopener noreferrer"><span>{item.label}</span><ExternalLink size={15}/></a>)}</section>
      <div className="news-article__notice"><strong>Leia o contexto antes de concluir</strong><p>Esta matéria organiza registros públicos para facilitar a consulta. A existência de processo, diferença estatística ou despesa atípica não prova crime ou irregularidade. Consulte os documentos oficiais e o andamento atualizado.</p></div>
      <section className="news-article__share"><div><span>ESPALHE A INFORMAÇÃO COM A FONTE</span><h2>Compartilhe esta matéria</h2><p>O link abre esta notícia no Politica007 e mantém as fontes oficiais ao alcance.</p></div><NewsShareActions title={article.title} url={`https://politica007.com.br/news/${day}/${slug}`}/></section>
    </article>
  </main>;
}
