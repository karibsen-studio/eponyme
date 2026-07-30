import { useHead } from '#app'
import iconUrl from '../assets/icon.ico?url'

export function useEponymeFavicon() {
  useHead({
    link: [
      {
        key: 'eponyme-favicon',
        rel: 'icon',
        type: 'image/x-icon',
        href: iconUrl,
      },
    ],
  })
}
