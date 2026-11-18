import { pageMetadata } from "@/lib/seo-metadata";
import {SavedPages} from "@/components/platform/page-tools";
import {PageHeader} from "@/components/shell/shell-context";
export const metadata = pageMetadata("Minhas consultas e comparações · Politica007", "Acesse as consultas e comparações salvas neste navegador para continuar sua pesquisa de dados públicos.", "/acompanhar");

export default function Page(){return <main className="platform-page"><PageHeader group="Ferramentas" current="Minhas consultas"/><h1>Minhas consultas e comparações</h1><SavedPages/></main>;}
