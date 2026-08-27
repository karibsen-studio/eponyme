import { defineEponymeRoles, permission } from '../../../../src/eponyme'

export default defineEponymeRoles({
  'article-reader': {
    label: 'Article reader',
    permissions: [
      permission.allow('content.read', permission.collection('articles')),
    ],
  },
  'contributor': {
    label: 'Contributor',
    permissions: [
      permission.allow(
        ['content.read', 'content.create', 'content.update'],
        permission.collection('articles'),
      ),
    ],
  },
  'publisher': {
    label: 'Publisher',
    permissions: [
      permission.allow(
        ['content.read', 'content.publish', 'content.unpublish', 'content.schedule'],
        permission.collection('articles'),
      ),
    ],
  },
  'article-manager': {
    label: 'Article manager',
    permissions: [
      permission.allow(
        [
          'content.read',
          'content.create',
          'content.update',
          'content.publish',
          'content.unpublish',
          'content.schedule',
          'content.trash',
          'content.restore',
        ],
        permission.collection('articles'),
      ),
    ],
  },
  'release-editor': {
    label: 'Release editor',
    permissions: [
      permission.allow(
        ['content.read', 'content.create', 'content.update'],
        permission.collection('releases'),
      ),
    ],
  },
  'homepage-editor': {
    label: 'Homepage editor',
    permissions: [
      permission.allow(
        ['content.read', 'content.update'],
        permission.singleton('pages/homepage'),
      ),
    ],
  },
  'pages-editor': {
    label: 'Pages editor',
    permissions: [
      permission.allow(
        ['content.read', 'content.update'],
        permission.folder('pages'),
      ),
      permission.deny(
        'content.update',
        permission.singleton('pages/frozen'),
      ),
    ],
  },
  'form-reviewer': {
    label: 'Form reviewer',
    permissions: [
      permission.allow('submissions.read', permission.form('contact')),
    ],
  },
  'form-manager': {
    label: 'Form manager',
    permissions: [
      permission.allow(
        ['submissions.read', 'submissions.delete'],
        permission.form('contact'),
      ),
    ],
  },
  'media-reader': {
    label: 'Media reader',
    permissions: [
      permission.allow('media.read', permission.system('media')),
    ],
  },
  'media-librarian': {
    label: 'Media librarian',
    permissions: [
      permission.allow(
        ['media.read', 'media.upload', 'media.delete'],
        permission.system('media'),
      ),
    ],
  },
})
