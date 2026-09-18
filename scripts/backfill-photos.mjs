import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

/**
 * Shrink the listing photos already in Storage.
 *
 * New uploads are resized by the app, but everything uploaded before that fix
 * is still at camera resolution — the largest is 4.35 MB, and a search page
 * pulls them all. Supabase's on-the-fly resizing is a paid-plan feature and
 * returns 404 on this project, so the files themselves have to be replaced.
 *
 * Each object is re-encoded **in the same format and at the same path**, so the
 * URL is unchanged and no database row needs touching. Converting to WebP would
 * be smaller still, but it would change every stored path and require a matching
 * update across parking_spaces and profiles — more risk than the bytes saved.
 *
 *   node --env-file-if-exists=.env scripts/backfill-photos.mjs --dry-run
 *   node --env-file-if-exists=.env scripts/backfill-photos.mjs
 */

const BUCKET = 'parking-photos'
const MAX_EDGE = 1200
const QUALITY = 82
/** Anything smaller than this is already cheap to download. */
const SKIP_UNDER_BYTES = 300_000

const DRY_RUN = process.argv.includes('--dry-run')

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Every object in the bucket, walking into folders. */
async function listEverything() {
  const found = []

  async function walk(prefix) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000 })
    if (error) throw error

    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folders come back with no id and no metadata.
      if (!entry.id || !entry.metadata) {
        await walk(path)
        continue
      }
      found.push({
        path,
        size: Number(entry.metadata.size ?? 0),
        mime: String(entry.metadata.mimetype ?? ''),
      })
    }
  }

  await walk('')
  return found
}

/** Re-encode in the source format, so the extension stays valid. */
async function reencode(image, mime, extension) {
  const resized = image.rotate().resize({
    width: MAX_EDGE,
    height: MAX_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  })

  if (mime.includes('png') || extension === '.png') {
    return await resized.png({ compressionLevel: 9 }).toBuffer()
  }
  if (mime.includes('webp') || extension === '.webp') {
    return await resized.webp({ quality: QUALITY }).toBuffer()
  }
  return await resized.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer()
}

const objects = await listEverything()
console.log(`Found ${objects.length} objects in "${BUCKET}".\n`)

let changed = 0
let skipped = 0
let failed = 0
let savedBytes = 0

for (const object of objects) {
  try {
    if (object.mime && !object.mime.startsWith('image/')) {
      skipped += 1
      continue
    }
    if (object.size > 0 && object.size < SKIP_UNDER_BYTES) {
      skipped += 1
      continue
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(object.path)
    if (downloadError || !blob) {
      throw downloadError ?? new Error('no data returned')
    }

    const original = Buffer.from(await blob.arrayBuffer())
    const extension = object.path.slice(object.path.lastIndexOf('.')).toLowerCase()
    const image = sharp(original, { failOn: 'none' })
    const metadata = await image.metadata()

    const output = await reencode(image, object.mime, extension)

    // Re-encoding can grow a file. Never replace one with something larger.
    if (output.length >= original.length) {
      console.log(`  skip  ${object.path}  (already optimal)`)
      skipped += 1
      continue
    }

    const longest = Math.max(metadata.width ?? 0, metadata.height ?? 0)
    console.log(
      `  ${DRY_RUN ? 'would' : 'did  '} ${object.path}\n` +
        `        ${formatBytes(original.length)} -> ${formatBytes(output.length)}` +
        `  (${longest}px -> ${MAX_EDGE}px max, ${extension})`,
    )

    if (!DRY_RUN) {
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(object.path, output, {
          contentType: object.mime || 'application/octet-stream',
          upsert: true,
        })
      if (uploadError) throw uploadError
    }

    changed += 1
    savedBytes += original.length - output.length
  } catch (error) {
    failed += 1
    console.error(`  FAIL  ${object.path}: ${error.message}`)
  }
}

console.log(
  `\n${DRY_RUN ? 'Would change' : 'Changed'} ${changed}, ` +
    `skipped ${skipped}, failed ${failed}.`,
)
console.log(`Saved ${formatBytes(savedBytes)}.`)
if (DRY_RUN) console.log('\nDRY RUN — nothing was written.')
