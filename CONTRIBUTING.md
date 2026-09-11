# Contributing to Begonya

Thank you for your interest in contributing to the **Begonya Institutional Macro & SMC Algorithmic Trading Framework**.

## Code of Conduct & Contribution Philosophy

Begonya merges quantitative macroeconomic regime modelling (Python / Gemini AI / FRED) with deterministic microstructure execution rules (TypeScript / SMC). Stability, mathematical precision, and test coverage are paramount.

## Development Workflow

1. **Fork or Branch:** Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Coding Standards:**
   - **Python (Macro Engine & Orchestrator):** PEP 8 guidelines, typed functions (`typing`), explicit error handling.
   - **TypeScript (SMC Engine):** Strict typing (`strict: true`), immutable data transformations, zero implicit `any`.
3. **Commit Conventions:** Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` A new feature or trading rule.
   - `fix:` A bug fix or calibration adjustment.
   - `docs:` Documentation improvements.
   - `refactor:` Code restructuring without behavior changes.
   - `test:` Adding or updating automated tests.
   - `chore:` Repository maintenance, CI, or dependency updates.

## Testing & Quality Gates

Before submitting a Pull Request, ensure all quality gates pass locally:

### SMC Engine (TypeScript)
```bash
cd smc_engine
npm install
node --max-old-space-size=4096 ./node_modules/jest/bin/jest.js
```

### System Health & Orchestration Audit
```bash
python orchestrator/health_check.py
```

## Security & Secrets
- Never commit credentials, `.env` files, or live API tokens.
- Keep `.env.example` updated when introducing new environment variables.
