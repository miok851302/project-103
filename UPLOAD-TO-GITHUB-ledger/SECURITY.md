# Security

Ledger is a read-only viewer for company governance data. It stores no accounts, no user data and no payment information. This document states what it holds and what protects a public deployment.

## There are no API keys

Ledger needs **no API key, token or password** to run. It reads public company profiles and SEC EDGAR filings the same way a browser does.

Verify it yourself:

```powershell
Get-ChildItem -Recurse -File -Include *.py,*.js,*.html,*.json,*.md |
  Select-String -Pattern 'api[_-]?key|secret|token|password|bearer|sk-|ghp_|AKIA'
```

Every match is documentation prose explaining that none are needed. There is no `.env` file, and no credential is hard-coded.

Because nothing is hidden, there is nothing to leak or rotate. If you later add a paid provider, keep its key in a platform environment variable and never in the repository.

## Optional password

| Variable | Effect |
|---|---|
| `LEDGER_PASSWORD` | When set, every request needs HTTP Basic credentials |
| `LEDGER_USERNAME` | Username for that login (default `ledger`) |

```bash
LEDGER_PASSWORD='choose-something-long' LEDGER_USERNAME='me' python server.py
```

Comparison is constant-time, so response timing cannot reveal the password. Leave it unset for frictionless local use.

## Enabled by default

| Control | Behaviour |
|---|---|
| **Rate limiting** | 120 requests/minute per client, returning `429` with `Retry-After`. Stops the public URL being scripted as a free proxy against SEC and market-data endpoints. Adjust with `LEDGER_RATE_LIMIT` (10–5000). |
| **Security headers** | Strict `Content-Security-Policy` with no inline scripts, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, device APIs disabled, cross-origin isolation. |
| **No version disclosure** | The `Server` header reads `Ledger` with no version number. |
| **Error redaction** | Exceptions are logged server-side with a short reference; visitors get a plain message and that reference, never a stack trace or upstream URL. |
| **Input validation** | Ticker symbols validated before use; search queries capped at 80 characters. |
| **No directory listing** | Unknown paths return `404`; static serving is confined to `static/` with path traversal rejected. |
| **No CORS** | No `Access-Control-Allow-Origin` is sent, so other sites cannot read responses from a browser. |
| **No write endpoints** | The server answers `GET` only. There is no upload or state-changing route. |

## Before publishing

- [ ] No `.env` file in the repository
- [ ] Environment variables set in the platform dashboard, not committed
- [ ] Optional: `LEDGER_PASSWORD` set if the link should not be public
- [ ] `/api/health` returns only status, version and a timestamp

## Not covered

- **Upstream trust.** Governance facts come from company disclosures; a wrong figure is a data-quality issue, not a breach.
- **Coverage.** Curated issues exist for 27 companies. Absence from that list is not evidence of a clean record, and the app says so.
