import {getDailyNews} from "@/lib/platform/news";

export const dynamic="force-dynamic";
export const runtime="nodejs";

export function GET(request:Request){
  const feed=getDailyNews();
  const requested=Number(new URL(request.url).searchParams.get("limit"))||5;
  const limit=Math.max(1,Math.min(20,Math.floor(requested)));
  const articles=feed.articles.slice(0,limit).map(article=>{
    const path=`/news/${feed.day}/${article.slug}`;
    const imageQuery=new URLSearchParams({path}).toString();
    return {
      url:`https://politica007.com.br${path}`,
      title:article.title,
      content:article.body.join("\n\n"),
      image_url:`https://politica007.com.br/api/share?${imageQuery}`,
      published_at:article.publishedAt,
      source_name:"Politica007",
    };
  });

  return Response.json(
    {source:"politica007.com.br",day:feed.day,generated_at:feed.generatedAt,articles},
    {headers:{"Cache-Control":"public, max-age=0, s-maxage=30, stale-while-revalidate=60","X-Content-Type-Options":"nosniff"}},
  );
}
