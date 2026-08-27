import { defineEponymeRoles, permission } from '../../src/eponyme'

export default defineEponymeRoles({
  'article-reader': {
    label: 'Article reader',
    description: 'Can read articles without creating, editing or publishing them.',
    permissions: [
      permission.allow('content.read', permission.collection('articles')),
    ],
  },
  'contributor': {
    label: 'Contributor',
    description: 'Can create and update blog drafts without publishing them.',
    permissions: [
      permission.allow(
        ['content.read', 'content.create', 'content.update'],
        permission.collection('articles'),
      ),
    ],
  },
  'publisher': {
    label: 'Publisher',
    description: 'Can review and publish blog drafts without editing their content.',
    permissions: [
      permission.allow(
        ['content.read', 'content.publish', 'content.unpublish', 'content.schedule', 'content.update'],
        permission.collection('articles'),
      ),
    ],
  },
  'article-manager': {
    label: 'Article manager',
    description: 'Manages the complete article workflow, except permanent purging.',
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
  'movie-curator': {
    label: 'Movie curator',
    description: 'Creates and edits movie reviews without publication or deletion rights.',
    permissions: [
      permission.allow(
        ['content.read', 'content.create', 'content.update'],
        permission.collection('movies'),
      ),
    ],
  },
  'homepage-editor': {
    label: 'Homepage editor',
    description: 'Can edit only the homepage singleton.',
    permissions: [
      permission.allow(
        ['content.read', 'content.update'],
        permission.singleton('pages/test/Homepage'),
      ),
    ],
  },
  'pages-editor': {
    label: 'Pages editor',
    description: 'Can edit pages except the protected homepage.',
    permissions: [
      permission.allow(
        ['content.read', 'content.update'],
        permission.folder('pages'),
      ),
      permission.deny(
        'content.update',
        permission.singleton('pages/test/Homepage'),
      ),
    ],
  },
  'form-reviewer': {
    label: 'Form reviewer',
    description: 'Can consult contact submissions without deleting them.',
    permissions: [
      permission.allow('submissions.read', permission.form('contact')),
    ],
  },
  'form-manager': {
    label: 'Form manager',
    description: 'Can consult and delete contact submissions.',
    permissions: [
      permission.allow(
        ['submissions.read', 'submissions.delete'],
        permission.form('contact'),
      ),
    ],
  },
  'media-reader': {
    label: 'Media reader',
    description: 'Can browse and copy media without changing the library.',
    permissions: [
      permission.allow('media.read', permission.system('media')),
    ],
  },
  'media-librarian': {
    label: 'Media librarian',
    description: 'Can browse, upload and delete media.',
    permissions: [
      permission.allow(
        ['media.read', 'media.upload', 'media.delete'],
        permission.system('media'),
      ),
    ],
  },
})
