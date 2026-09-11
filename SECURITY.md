# Security Policy

## Supported Versions

Critical security patches and vulnerability fixes are applied to the active versions listed below:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

The Begonya framework handles financial market data, API keys, and algorithmic trading triggers. Security and secret confidentiality are taken very seriously.

If you identify a security vulnerability, private configuration leak, or critical bug:

1. **Do Not Open a Public Issue:** Please do not disclose vulnerabilities, token leaks, or exploit procedures publicly in GitHub issues or discussions.
2. **Private Disclosure:** Contact the project maintainer via GitHub private vulnerability reporting or email at `piard@users.noreply.github.com`.
3. **Response Time:** Acknowledgment is provided within 48 hours, followed by an assessment and patch release timeline.

## Secret Management & Operational Security

- **Zero-Secret Policy:** Never commit `.env` files, API keys (Google Gemini, FRED, TwelveData), or Telegram bot tokens to version control.
- **Environment Isolation:** Use `.env.example` as a template. All real credentials must reside strictly in local environment variables.
- **Token Rotation:** If an API key or Telegram token is accidentally exposed, rotate and revoke it immediately. Deleting the commit does not remove the secret from Git reflog history.
