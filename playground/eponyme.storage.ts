import { r2 } from '@eponyme/storage/r2'
// import { local } from '../src/storage'

// Temporary R2 trial. Credentials come from `.env` (see `playground/.env.example`), never from
// here. Swap for `local()` above to develop without a bucket.
export default r2({
  bucket: process.env.EPONYME_STORAGE_BUCKET!,
  endpoint: process.env.EPONYME_STORAGE_ENDPOINT!,
  // No `publicUrl`: the bucket is private, so `url()` presigns and Eponyme saves its own read
  // route into entries instead. Set this to the r2.dev or custom domain once one is enabled, and
  // images will be served straight from the CDN.
  // publicUrl: 'https://media.example.com',
})
