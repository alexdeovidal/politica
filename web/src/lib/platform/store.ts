import Database from "better-sqlite3";
import {normalizeName} from "@/lib/normalize";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";

let connection: Database.Database | null=null;
export function platformStore(){
  if(connection)return connection;
  const filename=process.env.POLITICA_PLATFORM_DB_PATH || path.join(path.dirname(process.env.ELOSYS_DB_PATH || path.resolve(process.cwd(),"../elosys.db")),"politica-platform.db");
  mkdirSync(/*turbopackIgnore: true*/ path.dirname(filename),{recursive:true});
  connection=new Database(filename);connection.function("normalize_public_name",{deterministic:true},(value:unknown)=>normalizeName(String(value??"")));connection.pragma("journal_mode=WAL");connection.pragma("busy_timeout=5000");
  connection.exec(`CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL,source_url TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metric(day TEXT NOT NULL,event TEXT NOT NULL,area TEXT NOT NULL,count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,event,area));
    CREATE TABLE IF NOT EXISTS claim(id TEXT PRIMARY KEY,person_id INTEGER NOT NULL,domain TEXT NOT NULL,secret_hash TEXT NOT NULL,created_at TEXT NOT NULL,verified_at TEXT,statement TEXT,statement_source TEXT);
    CREATE TABLE IF NOT EXISTS correction(id TEXT PRIMARY KEY,person_id INTEGER,path TEXT NOT NULL,description TEXT NOT NULL,source_url TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'recebida');
    CREATE TABLE IF NOT EXISTS sync_run(id INTEGER PRIMARY KEY,source TEXT NOT NULL,status TEXT NOT NULL,checked_at TEXT NOT NULL,changed_at TEXT,detail TEXT);
    CREATE TABLE IF NOT EXISTS external_record(id TEXT PRIMARY KEY,source TEXT NOT NULL,entity_key TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,event_date TEXT,url TEXT NOT NULL,payload TEXT NOT NULL,collected_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_external_entity ON external_record(entity_key,source,event_date);
    CREATE TABLE IF NOT EXISTS rate_limit(key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);`);
  return connection;
}

export function cached<T>(key:string,maxAge=86400000):T|null {
  const row=platformStore().prepare("SELECT payload,updated_at FROM cache WHERE key=?").get(key) as {payload:string;updated_at:string}|undefined;
  return row && Date.now()-Date.parse(row.updated_at)<maxAge ? JSON.parse(row.payload) as T:null;
}
export function cacheResult(key:string,payload:unknown,url:string){platformStore().prepare("INSERT INTO cache VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,source_url=excluded.source_url").run(key,JSON.stringify(payload),new Date().toISOString(),url);}

export function rateLimit(request:Request,scope:string,max=30):boolean{
  // Platform actions are bounded in persistent minute windows; no raw IP is stored.
  const client=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const bucket=Math.floor(Date.now()/60000);const key=`${scope}:${createHash("sha256").update(client).digest("hex")}`;
  platformStore().prepare("INSERT INTO rate_limit VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window").run(key,bucket);
  const row=platformStore().prepare("SELECT count FROM rate_limit WHERE key=?").get(key) as {count:number};
  platformStore().prepare("DELETE FROM rate_limit WHERE window<?").run(bucket-2);
  return row.count<=max;
}

export function cacheCollectedAt(key:string){return (platformStore().prepare("SELECT updated_at FROM cache WHERE key=?").get(key) as {updated_at:string}|undefined)?.updated_at||null;}
