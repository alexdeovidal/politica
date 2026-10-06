import {Skeleton} from "@/components/skeleton";

export function NewsIndexLoading(){
  return <main className="news-page" aria-busy="true" aria-label="Carregando notícias">
    <div className="news-masthead"><div className="news-masthead__copy"><Skeleton className="h-3 w-56"/><Skeleton className="mt-4 h-11 w-full max-w-2xl"/><Skeleton className="mt-3 h-4 w-full max-w-xl"/></div><Skeleton className="h-24 w-full"/></div>
    <section className="news-grid">{Array.from({length:4},(_,i)=><article className="news-card" key={i}><Skeleton className="aspect-video w-full"/><Skeleton className="mt-4 h-3 w-1/3"/><Skeleton className="mt-4 h-6 w-full"/><Skeleton className="mt-2 h-4 w-4/5"/></article>)}</section>
  </main>;
}

export function NewsEditionLoading(){
  return <main className="news-page" aria-busy="true" aria-label="Carregando edição anterior">
    <Skeleton className="h-4 w-36"/><Skeleton className="h-10 w-3/4 max-w-2xl"/><section className="news-grid">{Array.from({length:3},(_,i)=><article className="news-card" key={i}><Skeleton className="aspect-video w-full"/><Skeleton className="mt-4 h-3 w-1/3"/><Skeleton className="mt-4 h-6 w-full"/><Skeleton className="mt-2 h-4 w-4/5"/></article>)}</section>
  </main>;
}

export function NewsArticleLoading(){
  return <main className="news-article-page" aria-busy="true" aria-label="Carregando notícia">
    <Skeleton className="h-4 w-36"/><article className="news-article"><Skeleton className="h-3 w-44"/><Skeleton className="mt-6 h-10 w-full"/><Skeleton className="mt-2 h-10 w-4/5"/><Skeleton className="mt-5 aspect-video w-full"/>{Array.from({length:5},(_,i)=><Skeleton className="mt-5 h-4 w-full" key={i}/>)}</article>
  </main>;
}
