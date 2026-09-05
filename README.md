# Review Labeler

Standalone deterministic labeler for changed files. Teams define labels in `review-labels.json`; the package reads changed file paths and emits stable JSON.

## Config

```json
{
  "labels": [
    {
      "id": "docs",
      "name": "Docs",
      "color": "#059669",
      "rules": [{ "paths": ["README*", "docs/**", "**/*.md"] }]
    }
  ]
}
```

Rules match when the file path matches at least one `paths` pattern and, when present, the file change type is included in `changeTypes`. `excludePaths` removes path matches from a rule.

Supported path patterns are intentionally small and deterministic:

- `*` matches within one path segment.
- `**` matches across path segments.
- `?` matches one character within one path segment.
- Matching uses normalized `/` separators.

## CLI

```sh
review-labeler --config review-labels.json --changed-files '["README.md","src/review/rules.ts"]'
```

Or pass richer file objects:

```sh
review-labeler --changed-files '[{"path":"README.md","changeType":"modified"}]'
```

You can also read changed files from a JSON file or stdin:

```sh
review-labeler --changed-files-file changed-files.json
cat changed-files.json | review-labeler
```

## Inline Code Chunks

Source files can mark deterministic review chunks with comments. The CLI scans these markers with `--marked-source` and emits a `codeChunks` array.

```js
// review-labeler: needs-human-review

// review-labeler: helpers function parseAmount
function parseAmount(value) {
  return Number(value)
}

// review-labeler: tests line 5
it('handles cents', () => {
  expect(parseAmount('1.25')).toBe(1.25)
})
```

Marker behavior:

- No target defaults to the whole file.
- `function` targets the next function below the marker.
- `function name` targets the next function below the marker whose declaration includes `name`.
- `line 5` or `lines 5` targets from the line immediately after the marker through the next 5 lines.
- Multiple labels can be comma-separated, for example `review-labeler: needs-human-review,helpers function`.

```sh
review-labeler --marked-source src/app.ts --pretty
```

Output:

```json
{
  "labels": [
    {
      "id": "docs",
      "name": "Docs",
      "color": "#059669",
      "files": ["README.md"]
    }
  ],
  "files": [
    {
      "path": "README.md",
      "changeType": "unknown",
      "labels": ["docs"]
    }
  ]
}
```
