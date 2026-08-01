import type { MediaPlayerFieldDefinition, MediaPlayerFieldOptions } from '../types/field'

export function mediaPlayer(options: MediaPlayerFieldOptions = {}): MediaPlayerFieldDefinition {
  return { type: 'mediaPlayer', options }
}
