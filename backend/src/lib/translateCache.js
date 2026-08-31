// A cache that translates memory once and keeps it on disk.
// Prevents re-running translation on every access (re-translates when content changes and the hash mismatches).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data/memory-ja.json');

function read() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}
function write(o) {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(o)); } catch { /* not fatal if it fails */ }
}

/** Simple string hash (for a content signature) */
export function hashStr(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}

export function getCached(userId, hash) {
  const e = read()[userId];
  return e && e.hash === hash ? e.data : null;
}
export function setCached(userId, hash, data) {
  const c = read();
  c[userId] = { hash, data, at: Date.now() };
  write(c);
}
