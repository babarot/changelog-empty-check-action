# Empty Changelog Check Action

A GitHub Action that checks for empty changelog entries in pull requests.

## Features

- Detects newly added changelog entries without content
- Adds a customizable label to PRs with empty changelog entries
- Provides detailed output about empty entries
- Adds customizable comments for warnings and success states
- Supports customization through inputs

## Usage

```yaml
- uses: babarot/changelog-empty-check-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    pull-request-number: ${{ github.event.pull_request.number }}
    label-name: 'empty-changelog'  # optional
    warning-message: '🚨 Empty changelog entries detected'  # optional
    success-message: '✅ Changelog entry has been filled'  # optional
```

## Inputs

| Name | Description | Required | Default |
|------|-------------|----------|---------|
| `github-token` | GitHub token for API operations | Yes | `${{ github.token }}` |
| `pull-request-number` | Number of the pull request to check | Yes | N/A |
| `label-name` | Label to add when empty changelog is detected | No | `empty-changelog` |
| `warning-message` | Message to comment when empty changelog is detected | No | `''` |
| `success-message` | Message to comment when changelog is filled | No | `''` |

## Outputs

| Name | Description |
|------|-------------|
| `has_empty_changelog` | Whether empty changelog entries were found (`'true'` or `'false'`) |
| `empty_headers` | Newline-separated list of empty changelog headers |

## Example

```yaml
name: Check Empty Changelog

on:
  pull_request:
    paths:
      - 'CHANGELOG.md'

jobs:
  check-changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: babarot/changelog-empty-check-action@v1
        id: check
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          pull-request-number: ${{ github.event.pull_request.number }}
          warning-message: '🚨 Please add content to the empty changelog entries'
          success-message: '✅ Thanks for updating the changelog!'
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Make changes in `src/`
4. Run tests: `npm test`
5. Build: `npm run build`

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## Versioning

We use SemVer for versioning. For the versions available, see the tags on this repository.
