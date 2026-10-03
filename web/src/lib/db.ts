import Database from "better-sqlite3";
import path from "node:path";
import {normalizeName,normalizePublicTimestamp} from "./normalize";

const DB_PATH = process.env.ELOSYS_DB_PATH ?? path.join(process.cwd(), "..", "elosys.db");

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
