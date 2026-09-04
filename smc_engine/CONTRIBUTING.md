# Contributing

ChecklistTrigger is organized around market-data ingestion, analysis, validation, and notification boundaries.

## Development principles

- Keep domain logic separate from runtime and delivery concerns.
- Add regression tests when analysis behavior changes.
- Preserve deterministic behavior where the domain allows it.
- Document assumptions behind market-structure calculations.
- Never commit API keys, Telegram tokens, credentials, or private configuration.

## Commit convention

Use Conventional Commit style when possible:

```text
feat: add analysis capability
fix: correct market-structure rule
test: add benchmark regression
refactor: simplify decision pipeline
docs: update architecture notes
ci: update test workflow
chore: maintenance change
```

## Validation

Changes affecting analysis should include relevant test or benchmark evidence. Changes affecting notification or runtime behavior should include the corresponding integration or regression validation where available.

## Pull requests

Describe the change, rationale, validation performed, and known limitations. Avoid presenting experimental analysis as guaranteed trading performance.
