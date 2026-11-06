# Ledger

Search any listed company and see **who runs it** and **what has gone wrong**.

![Ledger](screens/team.png)

## Quick start

**Windows:** double-click `start.bat`.

**Any OS with Python 3.10+:**

```bash
python server.py --open
```

Then open <http://127.0.0.1:8770>. No API key, account or package install — the server uses only Python's standard library.

Other ports: `python server.py --port 9000`. For a public bind: `PORT=8000 HOST=0.0.0.0 python server.py`.

## What you get for any ticker

### 1. Leadership team — facts plus a public-record score
Ten executives from the company profile: name, title, age, disclosed pay for the last fiscal year, and options exercised / unvested. CEO, CFO and chair roles are tagged.

Each executive gets a **fact-based score (0–100)** from five disclosed inputs. Open **"Why this score"** on any card to see every factor, its value and its points:

| Factor | Max | What it measures |
|---|---|---|
| Age / succession risk | 20 | Younger executives → less near-term succession risk |
| Pay relative to team | 20 | Disclosed pay vs. the median of this leadership team |
| Separation of duties | 20 | Combined CEO + chair role scores lowest |
| Equity held | 20 | Options held vs. annual pay |

Rules that keep it honest:
- **Missing data never helps or hurts** — the maximum shrinks instead, and the card states the basis ("60 of 100 possible points were measurable").
- **Under 50 measurable points → no score.** The card says "Not enough data" rather than publishing a number built from one fact.
- Scores are **capped at 92** so a partial checklist cannot read as perfect.
- It measures **what is on the record, not competence** — and it does not predict performance.

A **team score** above the roster averages the individual scores across the executives who had enough data.

### 2. Curated issue record — researched and cited
A hand-compiled list of documented corporate problems for **27 companies**, each entry carrying:

- what happened and when
- severity (critical / high / medium / low) and status (ongoing / resolved / settled)
- the impact in plain terms
- **a link to a primary or reputable source** — US DOJ, SEC, FTC, EU Commission, court dockets, FDIC, NTSB, company filings

Examples in the database: Boeing's 737 MAX settlement and door-plug blowout, Wells Fargo's fake accounts, Volkswagen/BP-scale events, Meta's $5bn FTC settlement, JPMorgan's London Whale and 1MDB, J&J's talc bankruptcies, GE's SEC accounting penalty, Intel's foundry collapse, Tesla's voided pay package.

Coverage: AAPL, MSFT, META, AMZN, GOOGL, NVDA, TSLA, JPM, WFC, BA, XOM, T, JNJ, KO, NKE, DIS, HSBC, BABA, PSKY, GE, GS, SAP, TSM, ASML, INTC, CRM, MCD.

If a company is not curated, the app says so plainly: **no curated record is not a clean record.**

### 3. SEC filing scan — live and verified
For any US-listed company, the app:

1. maps the ticker to its **SEC CIK**
2. searches **EDGAR full-text search** for 23 disclosure themes over the last **3 years** — material weakness, restatement, non-reliance, SEC investigation, subpoena, Department of Justice, class action, going concern, covenant waiver, data breach, product recall, related-party transactions and more
3. **downloads each candidate filing** and confirms the term really appears in the document
4. filters boilerplate — audit-opinion language, bond indentures, tables of contents, M&A clauses — that mention the words without describing a problem
5. shows a **quoted excerpt** next to each hit, with a direct link to the official document

That verification step matters: raw keyword search returns heavy noise. In testing it reduced Apple from 15 matches to 4, Microsoft from 25 to 12, and kept Boeing's real hits (DOJ escrow in a 10-Q, pending securities class certification, liquidity covenants).

## How to read it honestly

- **Curated issues** answer *“what did this management team actually do, and how did it end?”*
- **Filing hits** answer *“what does this company disclose in official documents?”* A filing saying “class action” may be describing a routine risk factor.

Both are evidence. Neither is a verdict, and none of it is investment advice.

## Data sources

| Source | Used for | Notes |
|---|---|---|
| Yahoo Finance (public endpoints) | name, sector, price, officer roster, pay, ages | may be rate-limited; falls back gracefully |
| SEC EDGAR company_tickers.json | ticker → CIK mapping | refreshed daily |
| SEC EDGAR full-text search | disclosure keyword hits | last 3 years, core forms |
| SEC EDGAR archives | downloaded filings for verification and excerpts | every hit links here |

Caching: company profiles 30 minutes, filing scans 6 hours, disk snapshots 14 days.

SEC requests send a descriptive `User-Agent` as their fair-access policy requires. Set `LEDGER_SEC_UA` to add your own contact string.

## Structure

```
ledger/
├── start.bat / start.ps1
├── server.py                      # HTTP server, Yahoo + SEC clients, verification
├── data/curated_issues.json       # the hand-researched, cited database
├── static/
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
└── screens/
```

## Extending the curated database

Add an entry under `companies` in `data/curated_issues.json`:

```json
"TICKER": {
  "name": "Company Name",
  "note": "One-line characterisation of its governance record.",
  "issues": [
    {
      "title": "What happened",
      "category": "Regulatory & legal",
      "severity": "high",
      "status": "Resolved (settled)",
      "date": "2019-2021",
      "summary": "What was reported, in two or three sentences.",
      "impact": "What it cost or changed.",
      "sources": [
        { "label": "US DOJ — press release", "url": "https://www.justice.gov/..." }
      ]
    }
  ]
}
```

Restart the server to load it. Keep the rule: **no issue without a source link.**
