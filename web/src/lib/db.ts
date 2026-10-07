import Database from "better-sqlite3";
import path from "node:path";
import {statSync} from "node:fs";
import {normalizeName,normalizePublicTimestamp} from "./normalize";

const DB_PATH = process.env.ELOSYS_DB_PATH ?? path.join(process.cwd(), "..", "elosys.db");

export function databasePath(): string { return DB_PATH; }

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  _db.pragma("query_only = ON");
  _db.function("normalize_public_name", {deterministic:true}, (value:unknown)=>normalizeName(String(value??"")));
  _db.function("public_timestamp", {deterministic:true}, normalizePublicTimestamp);
  return _db;
}

const _tables = new Set<string>();
let _tablesLoaded = false;
let _schemaVersion = -1;

export function hasTable(name: string): boolean {
  const schemaVersion=db().pragma('schema_version',{simple:true}) as number;
  if (!_tablesLoaded || schemaVersion!==_schemaVersion) {
    _tables.clear();
    for (const r of db().prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>) {
      _tables.add(r.name);
    }
    _tablesLoaded = true;
    _schemaVersion = schemaVersion;
  }
  return _tables.has(name);
}

export function dataVersion():number{return db().pragma("data_version",{simple:true}) as number;}

export function databaseFingerprint():string{
  return [DB_PATH,`${DB_PATH}-wal`].map(filename=>{
    try{
      const file=statSync(filename);
      // ctime also changes for metadata operations that do not alter the SQLite
      // contents. On the production WAL this made every derived snapshot look
      // stale even while its size and modification time stayed unchanged.
      return [file.dev,file.ino,file.size,file.mtimeMs].join(":");
    }catch{return "missing";}
  }).join("|");
}

export function databaseFingerprintsMatch(a:string,b:string):boolean{
  const stable=(fingerprint:string)=>fingerprint.split("|").map(file=>{
    if(file==="missing")return file;
    // Read existing cache entries written before ctime was removed.
    return file.split(":").slice(0,4).join(":");
  }).join("|");
  return stable(a)===stable(b);
}
