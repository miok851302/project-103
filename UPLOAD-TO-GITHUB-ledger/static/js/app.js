const state = {
  company: null,
  symbol: null,
  loading: false,
  severity: "all",
  searchAbort: null,
  loadAbort: null,
  results: [],
  active: -1,
  toastTimer: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const SEV_ORDER = ["critical", "high", "medium", "low"];
const SEV_LABEL = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

/* ---------------- formatting ---------------- */

function num(v) {
  return Number.isFinite(v) ? v.toLocaleString("en-US") : "—";
}

function money(v, currency = "USD") {
  if (!Number.isFinite(v)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${Math.round(v).toLocaleString("en-US")} ${currency}`;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function initials(name) {
  const parts = String(name || "").replace(/^(Mr|Ms|Mrs|Dr)\.\s*/, "").split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

function toast(text) {
  const node = $("#toast");
  if (!node) return;
  clearTimeout(state.toastTimer);
  node.textContent = text;
  node.classList.add("show");
  state.toastTimer = setTimeout(() => node.classList.remove("show"), 2300);
}

/* ---------------- theme ---------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const use = $("#themeToggle use");
  if (use) use.setAttribute("href", theme === "dark" ? "#i-sun" : "#i-moon");
  try {
    localStorage.setItem("ledger.theme", theme);
  } catch {}
}

function initTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem("ledger.theme");
  } catch {}
  applyTheme(saved === "light" ? "light" : "dark");
}

/* ---------------- search ---------------- */

function renderSuggestions(items, query) {
  const box = $("#suggestions");
  state.results = items;
  state.active = items.length ? 0 : -1;
  if (!items.length) {
    box.innerHTML = `<div class="sug-empty">No matches for “${esc(query)}”. Try a ticker or a fuller name.</div>`;
    box.hidden = false;
    $("#searchInput").setAttribute("aria-expanded", "true");
    return;
  }
  box.innerHTML = items
    .map(
      (r, i) => `
      <button type="button" class="sug ${i === 0 ? "active" : ""}" data-symbol="${esc(r.symbol)}">
        <span class="sug-mark">${esc((r.symbol || "?").slice(0, 4))}</span>
        <span class="sug-main"><strong>${esc(r.name || r.symbol)}</strong><span>${esc(r.symbol)}${r.exchange ? ` · ${esc(r.exchange)}` : ""}</span></span>
        <span class="sug-side">${esc(r.exchange || "")}</span>
      </button>`
    )
    .join("");
  box.hidden = false;
  $("#searchInput").setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  $("#suggestions").hidden = true;
  state.results = [];
  state.active = -1;
  $("#searchInput").setAttribute("aria-expanded", "false");
}

function moveActive(delta) {
  const items = $$(".sug");
  if (!items.length) return;
  state.active = (state.active + delta + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle("active", i === state.active));
}

async function search(query) {
  const q = query.trim();
  if (!q) {
    hideSuggestions();
    return;
  }
  state.searchAbort?.abort();
  const ctrl = new AbortController();
  state.searchAbort = ctrl;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error("search failed");
    const data = await res.json();
    if (!ctrl.signal.aborted) renderSuggestions(data.results || [], q);
  } catch (err) {
    if (err.name !== "AbortError") renderSuggestions([], q);
  }
}

/* ---------------- loading ---------------- */

function setLoading() {
  $("#loadingState").hidden = false;
  $("#errorState").hidden = true;
  $("#results").hidden = true;
}

function showError(symbol, message) {
  $("#loadingState").hidden = true;
  $("#results").hidden = true;
  $("#errorState").hidden = false;
  $("#errorTitle").textContent = `Could not load ${symbol}.`;
  $("#errorMessage").textContent = message;
  $("#errorState").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadCompany(symbol, opts = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) return;
  state.loadAbort?.abort();
  const ctrl = new AbortController();
  state.loadAbort = ctrl;
  state.loading = true;
  state.symbol = sym;
  state.severity = "all";
  hideSuggestions();
  setLoading();
  if (opts.scroll) {
    $("#loadingState").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  try {
    const res = await fetch(`/api/company/${encodeURIComponent(sym)}`, { signal: ctrl.signal });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "No data for this company.");
    if (ctrl.signal.aborted) return;
    state.company = data;
    state.loading = false;
    $("#loadingState").hidden = true;
    render();
    $("#results").hidden = false;
    const url = new URL(location.href);
    url.searchParams.set("ticker", data.symbol || sym);
    history.replaceState({}, "", url);
    document.title = `${data.name || sym} — Ledger`;
    if (opts.scroll) {
      setTimeout(() => $("#top").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } else {
      window.scrollTo({ top: 0 });
    }
  } catch (err) {
    if (err.name === "AbortError") return;
    state.loading = false;
    const msg =
      err instanceof TypeError
        ? "Could not reach the Ledger server. Is it still running?"
        : err.message;
    showError(sym, msg);
  }
}

/* ---------------- rendering ---------------- */

function render() {
  const c = state.company;
  if (!c) return;
  renderHead(c);
  renderTeam(c);
  renderRisk(c);
  renderIssues(c);
  renderFilings(c);
  renderMeta(c);
}

function renderHead(c) {
  $("#tickMark").textContent = (c.symbol || "??").slice(0, 4);
  $("#companyTicker").textContent = c.symbol;
  $("#companyExchange").textContent = c.exchange || "Listed";
  $("#companySector").textContent = c.sector || "Company";
  $("#companyName").textContent = c.name;
  const bits = [c.industry, c.country, Number.isFinite(c.employees) ? `${num(c.employees)} employees` : null].filter(Boolean);
  $("#companyMeta").textContent = bits.join(" · ") || "Public company";

  const sec = $("#secLink");
  if (c.cik) {
    sec.href = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(c.cik)}&type=&dateb=&owner=include&count=40`;
    sec.hidden = false;
  } else {
    sec.hidden = true;
  }
  const site = $("#siteLink");
  if (c.website) {
    site.href = c.website;
    site.hidden = false;
  } else {
    site.hidden = true;
  }

  const curated = c.curated || {};
  const notice = $("#coverageNotice");
  if (!curated.matched) {
    $("#coverageText").textContent =
      "No hand-curated issue record exists for this company yet. The SEC filing scan below is live and complete — but the absence of curated issues is not evidence of a clean record.";
    notice.hidden = false;
  } else {
    notice.hidden = true;
  }
}

function renderTeam(c) {
  const officers = c.officers || [];
  const team = c.team || {};
  $("#teamCount").textContent = `${team.count || 0} officers`;  const shortName = String(c.name || "")
    .replace(/[,.]/g, "")
    .replace(/\b(The|Inc|Corporation|Corp|Company|Limited|Ltd|plc|SE|NV|Group|Holding|Holdings)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  $("#teamHeading").textContent = team.count
    ? `Who runs ${shortName || c.symbol}.`
    : "Leadership not published.";
  const facts = $("#teamFacts");
  const factRows = (team.facts || []).slice();
  if (Number.isFinite(team.teamScore)) {
    factRows.unshift(
      `Fact-based team score: ${team.teamScore}/100, averaged across ${team.measured} of ${team.count} executives with enough disclosed data.`
    );
  }
  facts.innerHTML = factRows.map((f) => `<li>${esc(f)}</li>`).join("");
  facts.hidden = !factRows.length;

  const grid = $("#officerGrid");
  if (!officers.length) {
    grid.innerHTML = `<div class="officer-empty">No executive roster is published for this listing.</div>`;
    return;
  }
  grid.innerHTML = officers
    .map((o) => {
      const badges = [];
      if (o.isChief) badges.push('<span class="badge ceo">CEO</span>');
      if (o.isCFO) badges.push('<span class="badge cfo">CFO</span>');
      if (o.isChair) badges.push('<span class="badge chair">Chair</span>');
      const meta = [];
      if (Number.isFinite(o.age)) meta.push(`<span>age <b>${Math.round(o.age)}</b></span>`);
      if (Number.isFinite(o.pay)) meta.push(`<span>pay <b>${money(o.pay, c.currency)}</b></span>`);
      if (Number.isFinite(o.exercisedValue) && o.exercisedValue > 0)
        meta.push(`<span>options exercised <b>${money(o.exercisedValue, c.currency)}</b></span>`);
      if (Number.isFinite(o.unexercisedValue) && o.unexercisedValue > 0)
        meta.push(`<span>unvested <b>${money(o.unexercisedValue, c.currency)}</b></span>`);
      if (meta.length === 0) meta.push('<span>details not disclosed</span>');

      const r = o.rating || {};
      const ratingClass =
        r.score === null || r.score === undefined
          ? "none"
          : r.score >= 80
            ? "strong"
            : r.score >= 65
              ? "sound"
              : r.score >= 50
                ? "mixed"
                : "weak";
      const ratingBlock =
        r.score === null || r.score === undefined
          ? `<div class="officer-rating ${ratingClass}"><span class="rlabel">Not enough data</span><small>${esc(r.basis || "")}</small></div>`
          : `<div class="officer-rating ${ratingClass}">
               <span class="rnum">${r.score}</span><span class="rlabel">${esc(r.grade)}</span>
             </div>`;
      const factorRows = (r.factors || [])
        .map(
          (f) => `
          <li>
            <span class="fx">${esc(f.label)}</span>
            <span class="fv">${esc(f.value)}</span>
            <span class="fp">${f.points === null || f.points === undefined ? "—" : `${f.points}/${f.max}`}</span>
          </li>`
        )
        .join("");
      return `
        <div class="officer">
          <div class="officer-head">
            <span class="officer-name">${esc(o.name)}</span>
            ${badges.join("")}
          </div>
          <p class="officer-title">${esc(o.title || "—")}</p>
          ${ratingBlock}
          <div class="officer-meta">${meta.join("")}</div>
          ${factorRows ? `<details class="factor-details"><summary>Why this score</summary><ul class="factor-list">${factorRows}</ul><small class="factor-basis">${esc(r.basis || "")}</small></details>` : ""}
        </div>`;
    })
    .join("");
}

function renderRisk(c) {
  const curated = c.curated || {};
  const issues = curated.issues || [];
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach((i) => {
    if (counts[i.severity] !== undefined) counts[i.severity] += 1;
  });
  const open = issues.filter((i) => /ongoing/i.test(i.status || "")).length;
  const categories = new Set(issues.map((i) => i.category)).size;

  const max = Math.max(1, ...SEV_ORDER.map((s) => counts[s]));
  $("#severityBars").innerHTML = SEV_ORDER.map(
    (s) => `
      <div class="sev-row">
        <span class="sev-label">${SEV_LABEL[s]}</span>
        <div class="sev-track"><span class="sev-fill ${s}" style="width:${(counts[s] / max) * 100}%"></span></div>
        <span class="sev-count">${counts[s]}</span>
      </div>`
  ).join("");

  $("#curatedTotal").textContent = curated.matched ? issues.length : "0";
  $("#openTotal").textContent = open;
  $("#categoryTotal").textContent = categories;

  const chip = $("#riskChip");
  let worst = null;
  if (counts.critical) worst = "critical";
  else if (counts.high) worst = "high";
  else if (counts.medium) worst = "medium";
  else if (counts.low) worst = "low";
  if (!curated.matched) {
    chip.className = "risk-chip none";
    chip.textContent = "Not curated";
  } else if (!worst) {
    chip.className = "risk-chip low";
    chip.textContent = "No curated issues";
  } else {
    chip.className = `risk-chip ${worst}`;
    chip.textContent = `Worst: ${SEV_LABEL[worst]}`;
  }

  const note = $("#riskNote");
  if (!curated.matched) {
    note.textContent = "Curated coverage is expanding. Filing scan results below still apply.";
  } else {
    note.textContent = `Hand-researched and cited${curated.reviewedAt ? ` · reviewed ${fmtDate(curated.reviewedAt)}` : ""}. Not a complete list of every dispute.`;
  }
  $("#curatedIntro").textContent = curated.matched
    ? curated.note || "Documented corporate problems with links to the underlying source."
    : "No curated record for this company yet. The live SEC filing scan below covers it instead.";
}

function renderIssues(c) {
  const curated = c.curated || {};
  const list = $("#issueList");
  const issues = (curated.issues || []).filter(
    (i) => state.severity === "all" || i.severity === state.severity
  );

  $$("#severityFilter button").forEach((b) => {
    b.classList.toggle("on", b.dataset.sev === state.severity);
    b.disabled = !curated.matched;
  });

  if (!issues.length) {
    list.innerHTML = curated.matched
      ? `<div class="issue-empty">No ${state.severity === "all" ? "" : SEV_LABEL[state.severity].toLowerCase()} issues in the curated record for this company.</div>`
      : `<div class="issue-empty">No hand-curated issues for <strong>${esc(c.symbol)}</strong> yet.<br>Scroll down to the SEC filing scan for live, sourced disclosures from its official documents.</div>`;
    return;
  }

  list.innerHTML = issues
    .map((i) => {
      const open = /ongoing/i.test(i.status || "");
      const sources = (i.sources || [])
        .map(
          (s) =>
            `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}<svg class="icon"><use href="#i-external"></use></svg></a>`
        )
        .join("");
      return `
        <article class="issue">
          <div class="issue-head">
            <span class="issue-sev ${esc(i.severity)}">${esc(SEV_LABEL[i.severity] || i.severity)}</span>
            <div>
              <h3 class="issue-title">${esc(i.title)}</h3>
              <div class="issue-meta">
                <span>${esc(i.category)}</span>
                <span>·</span>
                <span>${esc(i.date || "")}</span>
                <span>·</span>
                <span class="${open ? "status open" : ""}">${esc(i.status || "")}</span>
              </div>
            </div>
          </div>
          <div class="issue-body">
            <p class="issue-summary">${esc(i.summary)}</p>
            ${i.impact ? `<p class="issue-impact">${esc(i.impact)}</p>` : ""}
            ${sources ? `<div class="issue-sources">${sources}</div>` : ""}
          </div>
        </article>`;
    })
    .join("");
}

function cleanText(text) {
  if (!text) return "";
  return String(text)
    .replace(/&#?\w+;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderFilings(c) {
  const d = c.disclosures || {};
  const groups = $("#filingGroups");
  const countEl = $("#filingsCount");
  if (!d.available) {
    countEl.textContent = "unavailable";
    groups.innerHTML = `<div class="issue-empty">${esc(d.reason || "SEC full-text search is unavailable for this listing.")}</div>`;
    return;
  }
  const items = d.items || [];
  countEl.textContent = `${items.length} verified`;
  $("#filingsIntro").textContent = `Each result was found in SEC EDGAR full-text search, then downloaded and checked to confirm the term appears in the document. ${d.rawHits ? `${d.rawHits} raw matches were reduced to ${items.length} verified disclosures over the last ${d.lookbackYears || 3} years. ` : ""}Always open the filing before drawing conclusions.`;
  if (!items.length) {
    groups.innerHTML = `<div class="issue-empty">No verified matches for the ${d.keywords || 0} disclosure themes in this company's filings over the last ${d.lookbackYears || 3} years.</div>`;
    return;
  }
  const byCat = new Map();
  for (const item of items) {
    const key = item.category || "Other";
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(item);
  }
  groups.innerHTML = [...byCat.entries()]
    .map(([category, hits]) => {
      const rows = hits
        .slice(0, 8)
        .map(
          (h) => `
          <a class="fhit" href="${esc(h.filingUrl)}" target="_blank" rel="noopener" title="${esc(h.keyword)} in ${esc(h.form)} filed ${esc(fmtDate(h.filed))}">
            <span class="fhit-head">
              <span class="fhit-key">${esc(h.keyword)}</span>
              <span class="fhit-form">${esc(h.form || "—")}</span>
              <span class="fhit-date">${esc(fmtDate(h.filed))}</span>
              <span class="fhit-link">open filing<svg class="icon"><use href="#i-external"></use></svg></span>
            </span>
            ${h.excerpt ? `<span class="fhit-excerpt">${esc(cleanText(h.excerpt))}</span>` : ""}
          </a>`
        )
        .join("");
      return `
        <div class="fgroup">
          <div class="fgroup-head"><svg class="icon"><use href="#i-file"></use></svg><span class="fgroup-name">${esc(category)}</span><span class="fgroup-count">${hits.length} found</span></div>
          <div class="fhits">${rows}</div>
        </div>`;
    })
    .join("");
}

function renderMeta(c) {
  const meta = c.meta || {};
  const ci = c.curated || {};
  $("#metaLine").textContent = `Sources: ${meta.provider || "Yahoo Finance · SEC EDGAR"} · fetched ${fmtDate(
    meta.fetchedAt
  )} · filings checked ${fmtDate((c.disclosures || {}).checkedAt)} · curated record ${
    ci.matched ? "available" : "not yet available for this company"
  }.`;
}

/* ---------------- events ---------------- */

function syncSeverityTabs() {
  $$("#severityFilter button").forEach((b) => b.classList.toggle("on", b.dataset.sev === state.severity));
}

function init() {
  initTheme();

  $("#themeToggle").addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  const input = $("#searchInput");
  const form = $("#searchForm");
  let debounce = null;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const q = input.value.trim();
    if (!q) {
      hideSuggestions();
      return;
    }
    debounce = setTimeout(() => search(q), 170);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const pick = state.results[state.active];
    if (pick) {
      loadCompany(pick.symbol, { scroll: true });
      return;
    }
    const raw = input.value.trim().split(/\s|—/)[0];
    if (raw) loadCompany(raw, { scroll: true });
  });

  $("#suggestions").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-symbol]");
    if (btn) loadCompany(btn.dataset.symbol, { scroll: true });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-zone")) hideSuggestions();
    const chip = e.target.closest("[data-symbol]");
    if (chip && !chip.closest(".search-zone") && !chip.closest("#results")) {
      loadCompany(chip.dataset.symbol, { scroll: true });
    }
    const quick = e.target.closest("#quickChips button, #errorState [data-symbol]");
    if (quick) loadCompany(quick.dataset.symbol, { scroll: true });
  });

  $("#retryButton").addEventListener("click", () => loadCompany(state.symbol, { scroll: true }));

  $("#severityFilter").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sev]");
    if (!btn || btn.disabled) return;
    state.severity = btn.dataset.sev;
    syncSeverityTabs();
    if (state.company) renderIssues(state.company);
  });

  window.addEventListener("scroll", () => {
    document.body.classList.toggle("scrolled", window.scrollY > 10);
  });

  fetch("/api/health")
    .then((r) => r.json())
    .then((d) => {
      if (Number.isFinite(d.curatedCompanies)) $("#curatedCount").textContent = d.curatedCompanies;
    })
    .catch(() => {});
  $("#keywordCount").textContent = "23";

  const params = new URLSearchParams(location.search);
  const ticker = (params.get("ticker") || "").toUpperCase();
  if (ticker) loadCompany(ticker, { scroll: false });
}

init();
