import {PublicProfileForm} from "@/components/platform/public-profile";
import {PageHeader} from "@/components/shell/shell-context";
export default async function Page({searchParams}:PageProps<"/ficha-publica">){const p=await searchParams;const id=typeof p.pessoa==="string"&&/^[1-9]\d*$/.test(p.pessoa)?p.pessoa:"";return <main className="platform-page"><PageHeader group="Ferramentas" current="Minha ficha pública"/><h1>Minha ficha pública</h1><PublicProfileForm initialPersonId={id}/></main>;}
