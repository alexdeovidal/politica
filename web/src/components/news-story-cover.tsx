import Image from "next/image";
import type {DailyNewsArticle} from "@/lib/platform/news";

export const OPENING_NEWS_SLUG = "p28350-adesivos-estreia";

export function NewsStoryCover({article}:{article:DailyNewsArticle}) {
  if(article.slug===OPENING_NEWS_SLUG){
    return (
      <div className="news-story-cover" role="img" aria-label={`Capa da notícia: ${article.title}`}>
        <Image
          src="/news/capa-adesivos-campanha.jpg"
          alt="Ilustração editorial de materiais adesivos e documentos de prestação de contas"
          fill
          preload
          sizes="(max-width: 760px) 100vw, 1180px"
        />
        <div className="news-story-cover__shade" aria-hidden="true" />
        <div className="news-story-cover__copy">
          <span>PRESTAÇÃO DE CONTAS · ELEIÇÃO 2026</span>
          <strong>R$ 766 mil</strong>
          <p>em dois lançamentos de adesivos</p>
        </div>
        <span className="news-story-cover__note">
          Registros declarados · não comprovam irregularidade
        </span>
      </div>
    );
  }

  const highlight=article.highlights[0];
  const year=new Date(article.publishedAt).getFullYear();
  return (
    <div className="news-story-cover news-story-cover--generated" role="img" aria-label={`Imagem da notícia: ${article.title}`}>
      <div className="news-story-cover__visual" aria-hidden="true">
        <div className="news-story-cover__orbit news-story-cover__orbit--one" />
        <div className="news-story-cover__orbit news-story-cover__orbit--two" />
        <div className="news-story-cover__document news-story-cover__document--back"><i/><i/><i/></div>
        <div className="news-story-cover__document news-story-cover__document--front"><b>POLITICA007</b><i/><i/><i/><i/></div>
        <div className="news-story-cover__chart"><i/><i/><i/><i/><i/></div>
        <span className="news-story-cover__seal">P</span>
      </div>
      <div className="news-story-cover__generated-copy">
        <span>{article.category} · {year}</span>
        <strong>{article.title}</strong>
        {highlight&&<p><small>{highlight.label}</small><b>{highlight.value}</b></p>}
      </div>
      <span className="news-story-cover__note">DADOS PÚBLICOS · POLITICA007.COM.BR</span>
    </div>
  );
}
