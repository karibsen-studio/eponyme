import prisma from '../utils/prisma'

/**
 * Fills the playground with content, to see how the dashboard behaves on a real volume:
 *
 *     curl -X POST 'http://localhost:3000/api/eponyme-seed?articles=5000&movies=2000'
 *     curl -X POST 'http://localhost:3000/api/eponyme-seed?reset=1'
 *
 * Writes go straight to Prisma in batches rather than through `EponymeService`, which opens
 * a transaction per entry: right for a save, unusable for seven thousand. The filterable
 * index is rebuilt once at the end instead, by the same route the dashboard offers.
 *
 * Same reasoning as `eponyme-reindex`: a Nitro task would be the natural home, but a
 * module's server auto-imports do not reach `server/tasks/`, so this is a route, closed
 * outside dev rather than left reachable in production.
 */

const CATEGORIES = ['business', 'design', 'engineering', 'guides', 'news', 'product']
const TAGS = ['Nuxt', 'Vue', 'TypeScript', 'Prisma']
const ADJECTIVES = ['Rapide', 'Discret', 'Ambitieux', 'Minimal', 'Nocturne', 'Solaire', 'Tranquille', 'Obstiné']
const NOUNS = ['atelier', 'voyage', 'portrait', 'chantier', 'inventaire', 'carnet', 'dimanche', 'passage']
const PLACES = ['à Paris', 'en Bretagne', 'au bord du lac', 'sous la pluie', 'en hiver', 'de nuit']
const INSERT_CHUNK = 500

/** Deterministic, so two runs produce the same content and a bug stays reproducible. */
function pick<T>(values: T[], seed: number): T {
  return values[seed % values.length]!
}

function articleData(index: number) {
  const title = `${pick(ADJECTIVES, index)} ${pick(NOUNS, index * 7)} ${pick(PLACES, index * 13)}`
  return {
    title: `${title} ${index}`,
    slug: `article-${index}`,
    excerpt: `Article numero ${index}, ecrit pour remplir la collection et voir ce que le dashboard en fait.`,
    body: `<p>${title}. Un paragraphe suffit: ce texte n'est la que pour peser autant qu'un vrai article.</p>`,
    category: pick(CATEGORIES, index * 3),
    tags: [pick(TAGS, index), pick(TAGS, index * 5)].filter((tag, position, list) => list.indexOf(tag) === position),
    publishedOn: new Date(Date.now() - index * 3_600_000).toISOString().slice(0, 10),
  }
}

function movieData(index: number) {
  const title = `${pick(NOUNS, index * 3)} ${pick(PLACES, index)}`
  return {
    title: `${title} ${index}`,
    slug: `movie-${index}`,
    description: `Film numero ${index}. Note et resume tenus courts, le but est le volume.`,
    image: `https://picsum.photos/seed/movie-${index}/600/900`,
    rating: (index % 5) + 1,
  }
}

function buildRows(collection: string, count: number, build: (index: number) => Record<string, unknown>) {
  const now = Date.now()
  return Array.from({ length: count }, (_, position) => {
    const index = position + 1
    const data = build(index)
    // Four entries in five are published, the rest stay drafts: the sidebar shows both, and
    // a public listing must not answer with the same count as the dashboard's.
    const published = index % 5 !== 0
    // Spread over the past months so a list ordered by date is not one flat block.
    const date = new Date(now - index * 1_800_000)
    return {
      name: `${collection}/${data.slug}`,
      draft: data,
      published: published ? data : {},
      status: published ? 'published' : 'draft',
      publishedAt: published ? date : null,
      createdAt: date,
      updatedAt: date,
    }
  })
}

async function insert(rows: ReturnType<typeof buildRows>) {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    // `skipDuplicates` so running the seed twice tops the collection up instead of failing
    // on the first slug it already wrote.
    // Prisma types its JSON columns narrower than a plain object, which is all these rows hold.
    const chunk = rows.slice(start, start + INSERT_CHUNK) as NonNullable<Parameters<typeof prisma.eponyme.createMany>[0]>['data']
    await prisma.eponyme.createMany({ data: chunk, skipDuplicates: true })
  }
}

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ status: 404, message: 'Not found.' })

  const query = getQuery(event)
  const count = (value: unknown, fallback: number) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback
  }
  const articles = count(query.articles, 5000)
  const movies = count(query.movies, 2000)
  const startedAt = Date.now()

  if (query.reset) {
    // The index and the versions cascade from the entry, so this is the whole cleanup.
    await prisma.eponyme.deleteMany({ where: { name: { startsWith: 'articles/' } } })
    await prisma.eponyme.deleteMany({ where: { name: { startsWith: 'movies/' } } })
  }

  await insert(buildRows('articles', articles, articleData))
  await insert(buildRows('movies', movies, movieData))
  // Rows written behind the service have no index rows, so filtering by category or by tag
  // would silently miss them until each entry is next saved.
  const reindexed = await reindexEponymeEntries()

  return {
    articles,
    movies,
    reindexed: reindexed.entries,
    reset: Boolean(query.reset),
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  }
})
