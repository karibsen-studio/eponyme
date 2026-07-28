export interface EponymeNavigationNode {
  kind: 'folder' | 'collection' | 'form' | 'entry'
  path: string
  label: string
  children: EponymeNavigationNode[]
}
