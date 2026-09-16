#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit extension: Node's ESM resolver requires it, and tsconfig has
// `allowImportingTsExtensions` enabled so tsc accepts it too.
import { scanText, type Finding } from './lib/secrets.ts'

/**
 * Fails if any repository file looks like it holds a treasury key.
 *
 * Scans tracked files *and* untracked-but-not-ignored ones, so a new file is
 * caught before it is ever staged. This is deliberately content-based rather
 * than path-based: `.gitignore` only protects a file that happens to be named
 * and placed correctly, which is exactly the assumption that fails in practice.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Files that legitimately contain long hex strings or are not worth reading. */
const SKIP_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz', '.mp4', '.mov',
])

/** Lockfiles are full of integrity hashes and are never hand-edited. */
const SKIP_NAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
])

const MAX_BYTES = 2 * 1024 * 1024

function gitFiles(args: string[]): string[] {
  return execSync(`git ${args.join(' ')}`, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function listFiles(): string[] {
  // Tracked, plus untracked files that are not ignored.
  const tracked = gitFiles(['ls-files'])
  const untracked = gitFiles(['ls-files', '--others', '--exclude-standard'])
  return [...new Set([...tracked, ...untracked])].sort()
}

function readable(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? ''
  if (SKIP_NAMES.has(name)) return false
  if (SKIP_EXTENSIONS.has(extname(path).toLowerCase())) return false

  const absolute = join(ROOT, path)
  try {
    if (!statSync(absolute).isFile()) return false
    if (statSync(absolute).size > MAX_BYTES) return false
  } catch {
    return false
  }
  return true
}

interface Hit {
  file: string
  finding: Finding
}

const files = listFiles().filter(readable)
const hits: Hit[] = []

for (const file of files) {
  let content: string
  try {
    content = readFileSync(join(ROOT, file), 'utf8')
  } catch {
    continue
  }
  for (const finding of scanText(content)) {
    hits.push({ file, finding })
  }
}

if (hits.length === 0) {
  console.log(`check-secrets: clean (${files.length} files scanned)`)
  process.exit(0)
}

console.error('check-secrets: possible secrets found\n')
for (const { file, finding } of hits) {
  console.error(`  ${file}:${finding.line}  ${finding.kind}  (${finding.detail})`)
}
console.error(
  `\n${hits.length} finding(s). Remove the value, rotate it if it was ever real,` +
    `\nand if it is a public constant add it to PUBLIC_HEX_ALLOWLIST in scripts/lib/secrets.ts.`,
)
process.exit(1)
