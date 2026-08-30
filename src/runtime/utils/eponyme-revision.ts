/**
 * The header carrying the optimistic lock token a write is made against.
 *
 * A header rather than a body field: it has to reach `DELETE` as easily as `PATCH`, and the
 * publication routes reject every body key they do not expect - a revision in there would
 * read as content.
 *
 * Shared rather than server-side, because the dashboard sets it on every write it sends.
 */
export const EPONYME_REVISION_HEADER = 'x-eponyme-revision'
