import Link from "next/link";
import {ArrowUpRight} from "lucide-react";
import type {DailyNewsArticle} from "@/lib/platform/news";
import {NewsStoryCover,OPENING_NEWS_SLUG} from "@/components/news-story-cover";
import {NewsArticleImage} from "@/components/news-article-image";

export function NewsArticleCard({article,day,index}:{article:DailyNewsArticle;day:string;index:number}){
  const href=`/news/${day}/${article.slug}`;
  return <article className={`news-card${index===0?" news-card--lead":""}`}>
    <Link className="news-card__image-link" href={href} aria-label={`Abrir matéria: ${article.title}`}>
      {article.slug===OPENING_NEWS_SLUG?<NewsStoryCover article={article}/>:<NewsArticleImage day={day} article={article} priority={index===0}/>}
    </Link>
    <div className="news-card__top"><span className="news-card__category">{article.category}</span><time dateTime={article.publishedAt}>{new Date(article.publishedAt).toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"short"})}</time></div>
    <h2><Link href={href}>{article.title}</Link></h2>
    <p className="news-card__summary">{article.summary}</p>
    <div className="news-card__fact"><span>{article.highlights[0]?.label}</span><strong>{article.highlights[0]?.value}</strong><small>{article.highlights[0]?.detail}</small></div>
    <div className="news-card__footer"><Link href={`/politico/${article.personId}`}>{article.personName}<ArrowUpRight size={14}/></Link><Link className="news-card__read" href={href}>Ler matéria <ArrowUpRight size={15}/></Link></div>
  </article>;
}

export function NewsArticleGrid({articles,day,label="Matérias desta edição"}:{articles:DailyNewsArticle[];day:string;label?:string}){
  return <section className="news-grid" aria-label={label}>
    {articles.map((article,index)=><NewsArticleCard key={article.slug} article={article} day={day} index={index}/>)}
  </section>;
}
