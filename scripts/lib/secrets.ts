import { english } from './bip39-english.ts'

/**
 * Detection of accidentally-committed secrets.
 *
 * `.gitignore` only helps when a file is named and placed correctly — a stray
 * `my-keys.txt` walks straight past it. This scans file *contents* instead, so
 * it catches the mistake regardless of naming, which is the control that
 * actually protects a treasury key.
 *
 * Findings never carry the secret itself. A short prefix is enough to locate
 * the offending value without reproducing it in CI logs.
 */

const WORDS = new Set(english as string[])

/** A BIP-39 phrase is one of these lengths; anything longer is still suspicious. */
const MIN_MNEMONIC_WORDS = 12

/**
 * 64-hex values that are public constants, not secrets.
 *
 * A 64-hex string is also a transaction hash or an event topic, so without this
 * the check would fail on any repo that references one. The list is empty today
 * — the ERC-20 transfer topic it used to carry went with the EVM rail — but the
 * mechanism stays, because the next public constant will need it.
 */
export const PUBLIC_HEX_ALLOWLIST = new Set<string>([])

/** Values that are obviously placeholders rather than real secrets. */
const PLACEHOLDER = /^(your|my|the|xxx+|<|\.{3}|example|changeme|placeholder|todo|redacted|dummy|test)/i

/**
 * A TypeScript type annotation, not a value.
 *
 * `mnemonic: string`, `secret_key: string | null`, and the parameter in
 * `deriveKeyPair(mnemonic: string)` are declarations, and flagging them would
 * make the check unusable on any typed codebase.
 *
 * The trailing delimiter is what keeps this honest: a type word is only treated
 * as a type when something syntactic follows it. A real assignment whose value
 * merely *starts* with a type word — `mnemonic = "string abandon ..."`, and
 * "string" is in the BIP-39 wordlist — still has a word after it, so it is
 * still reported.
 */
const TYPE_ANNOTATION =
  /^(string|number|boolean|bigint|unknown|any)(\s*\|\s*(null|undefined|string|number|boolean|bigint))*\s*([),;={|}\]]|$)/i

/**
 * A function call, not a literal.
 *
 * `const mnemonic = readMnemonic()` reads the secret from somewhere else — the
 * file it came from is what should be checked, not the call site.
 */
const CALL_EXPRESSION = /^[A-Za-z_$][\w$.]*\s*\(/

export type FindingKind = 'mnemonic' | 'private-key' | 'secret-assignment'

export interface Finding {
  kind: FindingKind
  line: number
  /** A short, non-reconstructable hint. Never the secret. */
  detail: string
}

/** Locate a short identifying prefix without echoing the whole value. */
function fingerprint(value: string): string {
  const clean = value.replace(/^0x/i, '')
  return `${clean.slice(0, 10)}…`
}

/**
 * Runs of BIP-39 words separated by whitespace and nothing else.
 *
 * The separator rule is what makes this usable. BIP-39 words are ordinary
 * English words, so identifiers collide with the list constantly — `name`,
 * `string`, `address`, `return` and `size` are all in it. Joining words across
 * `:`, `.` or `(` produces runs of a dozen "words" out of ordinary TypeScript
 * and the check fires on every file. A real phrase is only ever
 * `word word word …`, so any non-whitespace character between two words ends
 * the run.
 *
 * Newlines are allowed between words, because a phrase is often pasted with
 * line breaks.
 */
export function findMnemonics(text: string): Finding[] {
  const findings: Finding[] = []
  const WORD = /[a-z]+/g

  let previousEnd = 0
  let line = 1
  let run: { words: number; startLine: number } | null = null

  const flush = () => {
    if (run && run.words >= MIN_MNEMONIC_WORDS) {
      findings.push({
        kind: 'mnemonic',
        line: run.startLine,
        detail: `${run.words} consecutive BIP-39 words`,
      })
    }
    run = null
  }

  for (const match of text.matchAll(WORD)) {
    const gap = text.slice(previousEnd, match.index)
    for (const character of gap) if (character === '\n') line++

    // Any punctuation, quote or code between two words breaks the phrase.
    if (!(gap.length > 0 && /^\s+$/.test(gap))) flush()

    if (WORDS.has(match[0])) {
      if (!run) run = { words: 0, startLine: line }
      run.words += 1
    } else {
      flush()
    }

    previousEnd = match.index + match[0].length
  }
  flush()

  return findings
}

/** 64-hex values that are not known public constants. */
export function findPrivateKeys(text: string): Finding[] {
  const findings: Finding[] = []
  const pattern = /(?<![0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g

  text.split(/\r?\n/).forEach((raw, index) => {
    for (const match of raw.matchAll(pattern)) {
      const value = match[1].toLowerCase()
      if (PUBLIC_HEX_ALLOWLIST.has(value)) continue
      findings.push({
        kind: 'private-key',
        line: index + 1,
        detail: fingerprint(value),
      })
    }
  })

  return findings
}

/**
 * Assignments whose label names a secret and whose value looks real.
 *
 * Catches the case where a secret is too short for the hex rule (an API key, a
 * seed phrase fragment) but is still clearly labelled as one. Placeholder
 * values and references to other variables are ignored.
 */
export function findSecretAssignments(text: string): Finding[] {
  const findings: Finding[] = []
  // The whole remainder of the line, not a single token: a mnemonic's first
  // word can be short ("evolve"), so a per-word minimum would miss it.
  const pattern =
    /(mnemonic|seed_?phrase|private_?key|secret_?key|treasury_?mnemonic)\s*[:=]\s*(.+)/i

  text.split(/\r?\n/).forEach((raw, index) => {
    // Only code can assign a secret. Documentation routinely writes things like
    // "the mnemonic: string" which are prose, not values — and a secret pasted
    // into a comment is still caught by the hex and BIP-39 run checks above,
    // which do scan comments.
    if (/^\s*(\/\/|\/\*|\*|--)/.test(raw)) return

    const match = raw.match(pattern)
    if (!match) return

    const value = match[2]
      .trim()
      .replace(/^["'`]/, '')
      .replace(/["'`][;,.]?$/, '')
      .replace(/[;,]\s*$/, '')
      .trim()

    if (value.length < 8) return
    if (PLACEHOLDER.test(value)) return
    // A reference to another variable (`process.env.X`) is not a secret.
    if (/^(process\.env|import\.meta|Deno\.env|\$\{|\$[A-Z_])/i.test(value)) return
    // A type annotation (`mnemonic: string`) declares a parameter, not a value.
    if (TYPE_ANNOTATION.test(value)) return
    // A call (`mnemonic = readMnemonic()`) reads the secret from elsewhere.
    if (CALL_EXPRESSION.test(value)) return

    findings.push({
      kind: 'secret-assignment',
      line: index + 1,
      detail: `${match[1]} = ${fingerprint(value)}`,
    })
  })

  return findings
}

/**
 * Marker that suppresses findings on the line it appears on, or the line after.
 *
 * Needed because the detector's own tests must contain a phrase to prove the
 * detector fires. Keeping it inline rather than excluding whole files means the
 * suppression is visible in review and cannot silently spread.
 */
const ALLOW_MARKER = 'check-secrets:allow'

function suppressedLines(text: string): Set<number> {
  const suppressed = new Set<number>()
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.includes(ALLOW_MARKER)) return
    suppressed.add(index + 1)
    suppressed.add(index + 2)
  })
  return suppressed
}

export function scanText(text: string): Finding[] {
  const suppressed = suppressedLines(text)

  return [
    ...findMnemonics(text),
    ...findPrivateKeys(text),
    ...findSecretAssignments(text),
  ]
    .filter((finding) => !suppressed.has(finding.line))
    .sort((a, b) => a.line - b.line)
}
