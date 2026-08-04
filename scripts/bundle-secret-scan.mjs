#!/usr/bin/env node
/**
 * bundle-secret-scan.mjs — scans the production build output (.next) for
 * leaked credentials.
 *
 * Client chunks (every .js file under .next/static) must never contain
 * secret material:
 * the Firebase service-account private key, admin env names, MongoDB
 * connection strings, LLM/OpenAI keys, Supabase remnants, or the
 * `firebase-adminsdk` service-account email. Anything the browser receives
 * is readable by anyone; server-only secrets belong on the server.
 *
 * Server chunks (every .js file under .next/server) are expected to
 * reference the `FIREBASE_SERVICE_ACCOUNT` / `MONGODB_URI` env names (they
 * are runtime `process.env` reads, not values) — the critical assertion is
 * their absence from client chunks.
 *
 * Usage:
 *   node scripts/bundle-secret-scan.mjs
 *
 * Exit codes:
 *   0 — no client-bundle leaks
 *   1 — leak found (client chunk) or build output missing
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const STATIC_DIR = path.join(ROOT, ".next", "static");
const SERVER_DIR = path.join(ROOT, ".next", "server");

/** Client chunks: any hit is a LEAK. */
const CLIENT_PATTERNS = [
  {
    name: "service-account private key (-----BEGIN PRIVATE KEY-----)",
    re: /-----BEGIN PRIVATE KEY-----/g,
  },
  { name: "FIREBASE_SERVICE_ACCOUNT", re: /FIREBASE_SERVICE_ACCOUNT/g },
  { name: "MONGODB_URI", re: /MONGODB_URI/g },
  { name: "MongoDB connection string (mongodb+srv://)", re: /mongodb\+srv:\/\//g },
  { name: "LLM_API_KEY", re: /LLM_API_KEY/g },
  // OpenAI-style API key: "sk-" followed by 20+ alphanumerics (same rule as
  // the repo's git grep scan; count is reported so trends are visible).
  { name: "OpenAI-style API key (sk- + 20 chars)", re: /sk-[A-Za-z0-9]{20,}/g },
  // Supabase was fully replaced by Firebase Auth + MongoDB; zero tolerated.
  { name: "Supabase", re: /supabase/gi },
  { name: "service-account email (firebase-adminsdk)", re: /firebase-adminsdk/g },
];

/**
 * Server chunks: these env names SHOULD appear here (runtime reads). We
 * report PRESENT/ABSENT; absence is suspicious (env reads tree-shaken away)
 * and fails the scan.
 */
const SERVER_PATTERNS = [
  { name: "FIREBASE_SERVICE_ACCOUNT", re: /FIREBASE_SERVICE_ACCOUNT/g },
  { name: "MONGODB_URI", re: /MONGODB_URI/g },
];

/** Recursively collect *.js files (source maps excluded). */
async function collectJsFiles(dir) {
  let files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files; // missing dir → empty (reported as ABSENT below)
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(await collectJsFiles(full));
    } else if (entry.name.endsWith(".js") && !entry.name.endsWith(".js.map")) {
      files.push(full);
    }
  }
  return files;
}

async function scanPattern(files, pattern) {
  const hits = [];
  let total = 0;
  for (const file of files) {
    const text = await readFile(file, "utf8");
    pattern.re.lastIndex = 0;
    const matches = text.match(pattern.re);
    if (matches && matches.length > 0) {
      total += matches.length;
      hits.push({ file: path.relative(ROOT, file), count: matches.length });
    }
  }
  return { total, hits };
}

function rel(file) {
  return file.replace(`${ROOT}${path.sep}`, "");
}

async function main() {
  const staticFiles = await collectJsFiles(STATIC_DIR);
  const serverFiles = await collectJsFiles(SERVER_DIR);

  if (staticFiles.length === 0 && serverFiles.length === 0) {
    console.error(
      "BLOCKED: no build output found under .next/static or .next/server.\n" +
        "Run `npm run build` first, then re-run this scan."
    );
    process.exit(2);
  }

  let failed = false;

  console.log(`Scanning ${staticFiles.length} client chunk(s) and ${serverFiles.length} server chunk(s)...\n`);
  console.log("CLIENT BUNDLES (.next/static) — secrets must be ABSENT:");
  for (const pattern of CLIENT_PATTERNS) {
    const { total, hits } = await scanPattern(staticFiles, pattern);
    if (total === 0) {
      console.log(`  CLEAN  ${pattern.name} — 0 occurrences`);
    } else {
      failed = true;
      for (const { file, count } of hits) {
        console.log(`  LEAK   ${pattern.name} — ${count} occurrence(s) in ${rel(file)}`);
      }
    }
  }

  console.log("\nSERVER BUNDLES (.next/server) — env names expected here:");
  for (const pattern of SERVER_PATTERNS) {
    const { total, hits } = await scanPattern(serverFiles, pattern);
    if (total > 0) {
      console.log(
        `  PRESENT ${pattern.name} — ${total} occurrence(s) in ${hits.length} file(s)`
      );
    } else {
      failed = true;
      console.log(
        `  ABSENT  ${pattern.name} — not found in server chunks (env read missing?)`
      );
    }
  }

  console.log("");
  if (failed) {
    console.error("LEAK: secret material found in shipped bundles (see above).");
    process.exit(1);
  }
  console.log("OK: no secret material in client bundles; server env reads intact.");
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
