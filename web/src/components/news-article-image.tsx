import Image from "next/image";
import type {DailyNewsArticle} from "@/lib/platform/news";

export function NewsArticleImage({day,article,priority=false}:{day:string;article:DailyNewsArticle;priority?:boolean}){
  const src=`/api/news-image?day=${encodeURIComponent(day)}&slug=${encodeURIComponent(article.slug)}`;
  return <div className="news-article-image">
    <Image src={src} alt={`Arte gerada com os dados da notícia: ${article.title}`} fill unoptimized preload={priority} sizes="(max-width: 760px) 100vw, 560px"/>
  </div>;
}
