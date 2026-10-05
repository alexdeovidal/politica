import Image from "next/image";

export const OPENING_NEWS_SLUG = "p28350-adesivos-estreia";

export function NewsStoryCover() {
  return (
    <div className="news-story-cover">
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
