const Dashboard = window.OnboardingDashboard;

const state = {
  snapshot: null,
  activeView: "queue",
  sortKey: "priority",
  sortDirection: "asc",
  queueFilters: {},
};

const elements = {
  file: document.getElementById("csvFile"),
  clearButton: document.getElementById("clearButton"),
  dashboard: document.getElementById("dashboard"),
  reportTitle: document.getElementById("reportTitle"),
  rowCount: document.getElementById("rowCount"),
  columnCount: document.getElementById("columnCount"),
  reportDate: document.getElementById("reportDate"),
  summaryCards: document.getElementById("summaryCards"),
  search: document.getElementById("searchFilter"),
  office: document.getElementById("officeFilter"),
  branch: document.getElementById("branchFilter"),
  representative: document.getElementById("representativeFilter"),
  status: document.getElementById("statusFilter"),
  priority: document.getElementById("priorityFilter"),
  blocker: document.getElementById("blockerFilter"),
  createdFrom: document.getElementById("createdFromFilter"),
  createdTo: document.getElementById("createdToFilter"),
  activityAge: document.getElementById("activityAgeFilter"),
  includeInactive: document.getElementById("includeInactiveFilter"),
  resetFilters: document.getElementById("resetFilters"),
  queueCount: document.getElementById("queueCount"),
  queueBody: document.getElementById("queueBody"),
  queueFilters: Array.from(document.querySelectorAll("[data-queue-filter]")),
  sortButtons: Array.from(document.querySelectorAll("[data-sort]")),
  queueView: document.getElementById("queueView"),
  breakdownView: document.getElementById("breakdownView"),
  blockerBreakdown: document.getElementById("blockerBreakdown"),
  statusBreakdown: document.getElementById("statusBreakdown"),
  officeBreakdown: document.getElementById("officeBreakdown"),
  warningList: document.getElementById("warningList"),
  drawer: document.getElementById("detailDrawer"),
  closeDrawer: document.getElementById("closeDrawer"),
  detailPriority: document.getElementById("detailPriority"),
  detailName: document.getElementById("detailName"),
  detailContent: document.getElementById("detailContent"),
};

const filterInputs = [
  elements.search,
  elements.office,
  elements.branch,
  elements.representative,
  elements.status,
  elements.priority,
  elements.blocker,
  elements.createdFrom,
  elements.createdTo,
  elements.activityAge,
  elements.includeInactive,
];

function formatNumber(value) {
  return new Intl.NumberFormat().format(value || 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Blank";
  }
  if (value instanceof Date) {
    return Dashboard.formatIsoDate(value);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Blank" : Dashboard.formatIsoDate(parsed);
}

function optionList(select, values, emptyLabel) {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.append(empty);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function getFilters() {
  return {
    search: elements.search.value,
    office: elements.office.value,
    branch: elements.branch.value,
    representative: elements.representative.value,
    status: elements.status.value,
    priority: elements.priority.value,
    blockerType: elements.blocker.value,
    createdFrom: elements.createdFrom.value,
    createdTo: elements.createdTo.value,
    activityAge: elements.activityAge.value,
    includeInactive: elements.includeInactive.checked,
  };
}

function getQueueFilterValue(key) {
  return String(state.queueFilters[key] || "").trim().toLowerCase();
}

function getPendingTotal(candidate) {
  return candidate.pendingTasks.length + candidate.pendingDocuments.length;
}

function queueText(candidate, key) {
  const values = {
    priority: candidate.priority,
    applicant: `${candidate.applicant} ${candidate.talentId}`,
    status: `${candidate.talentStatus} ${candidate.currentPlacementStatus}`,
    office: candidate.talentOffice || "Unassigned",
    representative: candidate.talentRepresentative || "Unassigned",
    blocker: `${candidate.topBlocker} ${candidate.blockerType}`,
    created: formatDate(candidate.createdDate),
  };
  return String(values[key] || "").toLowerCase();
}

function applyQueueColumnFilters(rows) {
  return rows.filter((candidate) => {
    const textFilters = ["priority", "applicant", "status", "office", "representative", "blocker", "created"];
    for (const key of textFilters) {
      const value = getQueueFilterValue(key);
      if (value && !queueText(candidate, key).includes(value)) {
        return false;
      }
    }

    const pendingFilter = getQueueFilterValue("pending");
    if (pendingFilter === "has" && getPendingTotal(candidate) === 0) {
      return false;
    }
    if (pendingFilter === "none" && getPendingTotal(candidate) > 0) {
      return false;
    }

    const activityFilter = getQueueFilterValue("activity");
    if (activityFilter === "blank" && candidate.lastActivityDate) {
      return false;
    }
    if (activityFilter === "stale7" && !(candidate.lastActivityAgeDays !== null && candidate.lastActivityAgeDays > 7)) {
      return false;
    }
    if (activityFilter === "stale14" && !(candidate.lastActivityAgeDays !== null && candidate.lastActivityAgeDays > 14)) {
      return false;
    }

    return true;
  });
}

function compareText(a, b) {
  return String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
}

function sortValue(candidate, key) {
  const values = {
    priority: Dashboard.PRIORITY_ORDER[candidate.priority] ?? 99,
    applicant: candidate.applicant,
    status: candidate.talentStatus,
    office: candidate.talentOffice || "Unassigned",
    representative: candidate.talentRepresentative || "Unassigned",
    blocker: candidate.topBlocker,
    pending: getPendingTotal(candidate),
    activity: candidate.lastActivityAgeDays === null ? Number.MAX_SAFE_INTEGER : candidate.lastActivityAgeDays,
    created: candidate.createdDate ? candidate.createdDate.getTime() : 0,
  };
  return values[key];
}

function sortQueueRows(rows) {
  const direction = state.sortDirection === "desc" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const left = sortValue(a, state.sortKey);
    const right = sortValue(b, state.sortKey);
    let result;
    if (typeof left === "number" && typeof right === "number") {
      result = left - right;
    } else {
      result = compareText(left, right);
    }
    if (result === 0 && state.sortKey !== "priority") {
      result = (Dashboard.PRIORITY_ORDER[a.priority] ?? 99) - (Dashboard.PRIORITY_ORDER[b.priority] ?? 99);
    }
    if (result === 0) {
      result = compareText(a.applicant, b.applicant);
    }
    return result * direction;
  });
}

function renderSortButtons() {
  elements.sortButtons.forEach((button) => {
    const active = button.dataset.sort === state.sortKey;
    button.classList.toggle("is-active", active);
    const label = button.textContent.replace(/[↑↓]\s*$/, "").trim();
    button.innerHTML = `${escapeHtml(label)}${active ? ` <span aria-hidden="true">${state.sortDirection === "asc" ? "↑" : "↓"}</span>` : ""}`;
    button.setAttribute("aria-sort", active ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none");
  });
}

function renderSummary(summary) {
  const cards = [
    ["Total", summary.totalCandidates, "", ""],
    ["Active candidates", summary.activeCandidates, "", "info"],
    ["Critical", summary.criticalActionItems, "action items", "critical"],
    ["High", summary.highActionItems, "action items", "high"],
    ["Pending stale", summary.pendingAndStale, "over 7 days", "high"],
    ["Missing owner", summary.missingOwner, "", "info"],
    ["I-9 incomplete", summary.i9Incomplete, "", "critical"],
    ["Fully vetted or started", summary.fullyVettedStarted, "", "good"],
  ];

  elements.summaryCards.innerHTML = cards
    .map(
      ([label, value, note, tone]) => `
        <article class="metric-card ${tone}">
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
          <span>${escapeHtml(note)}</span>
        </article>
      `,
    )
    .join("");
}

function renderFilters(snapshot) {
  const options = Dashboard.getFilterOptions(snapshot);
  optionList(elements.office, options.offices, "All offices");
  optionList(elements.branch, options.branches, "All branches");
  optionList(elements.representative, options.representatives, "All reps");
  optionList(elements.status, options.statuses, "All statuses");
  optionList(elements.priority, options.priorities, "All priorities");
  optionList(elements.blocker, options.blockerTypes, "All blockers");
}

function renderQueue(rows) {
  elements.queueCount.textContent = `${formatNumber(rows.length)} candidates`;

  if (rows.length === 0) {
    elements.queueBody.innerHTML = `
      <tr>
        <td colspan="9">No candidates match the current filters.</td>
      </tr>
    `;
    return;
  }

  elements.queueBody.innerHTML = rows
    .slice(0, 500)
    .map(
      (candidate) => `
        <tr>
          <td><span class="badge ${candidate.priority}">${candidate.priority}</span></td>
          <td>
            <button class="row-button" type="button" data-candidate="${candidate.id}">${escapeHtml(candidate.applicant || "Unnamed")}</button>
            <span class="subtle">${escapeHtml(candidate.talentId || "No talent ID")} | row ${candidate.rowNumber}</span>
          </td>
          <td>${escapeHtml(candidate.talentStatus || "No status")}<span class="subtle">${escapeHtml(candidate.currentPlacementStatus || "No placement status")}</span></td>
          <td>${escapeHtml(candidate.talentOffice || "Unassigned")}</td>
          <td>${escapeHtml(candidate.talentRepresentative || "Unassigned")}</td>
          <td>${escapeHtml(candidate.topBlocker)}<span class="subtle">${escapeHtml(candidate.blockerType)}</span></td>
          <td>${candidate.pendingTasks.length + candidate.pendingDocuments.length}<span class="subtle">${candidate.pendingCount} reported</span></td>
          <td>${candidate.lastActivityAgeDays === null ? "Blank" : `${candidate.lastActivityAgeDays} days`}<span class="subtle">${formatDate(candidate.lastActivityDate)}</span></td>
          <td>${formatDate(candidate.createdDate)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderBars(container, rows, valueKey) {
  const max = Math.max(...rows.map((row) => row[valueKey] || row.count || 0), 1);
  container.innerHTML = rows
    .slice(0, 12)
    .map((row) => {
      const value = row[valueKey] || row.count || 0;
      const width = Math.max(2, Math.round((value / max) * 100));
      return `
        <div class="bar-row">
          <span class="bar-label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span>
          <strong>${formatNumber(value)}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function renderWarnings(snapshot) {
  const warnings = snapshot.dataQualityWarnings || [];
  if (warnings.length === 0) {
    elements.warningList.innerHTML = '<div class="warning-item">No data quality warnings.</div>';
    return;
  }

  elements.warningList.innerHTML = warnings
    .map((warning) => {
      const detail =
        warning.type === "blank-heavy-columns"
          ? warning.details
              .slice(0, 8)
              .map((item) => `${escapeHtml(item.column)}: ${item.blankPct}% blank`)
              .join("; ")
          : warning.details.map(escapeHtml).join("; ");
      return `<div class="warning-item"><strong>${escapeHtml(warning.label)}</strong><br>${detail}</div>`;
    })
    .join("");
}

function renderBreakdowns(snapshot) {
  renderBars(elements.blockerBreakdown, snapshot.blockerBreakdown, "count");
  renderBars(elements.statusBreakdown, snapshot.statusFunnel, "count");
  renderBars(elements.officeBreakdown, snapshot.officeBreakdown, "count");
  renderWarnings(snapshot);
}

function refresh() {
  if (!state.snapshot) {
    return;
  }

  const rows = sortQueueRows(applyQueueColumnFilters(Dashboard.applyDashboardFilters(state.snapshot, getFilters())));
  renderSortButtons();
  renderQueue(rows);
}

function showDashboard(snapshot, fileName) {
  state.snapshot = snapshot;
  elements.dashboard.hidden = false;
  elements.clearButton.hidden = false;
  elements.reportTitle.textContent = fileName || "Uploaded report";
  elements.rowCount.textContent = `${formatNumber(snapshot.parsedRowCount)} rows`;
  elements.columnCount.textContent = `${formatNumber(snapshot.parsedColumnCount)} columns`;
  elements.reportDate.textContent = snapshot.reportDate;
  renderSummary(snapshot.summary);
  renderFilters(snapshot);
  renderBreakdowns(snapshot);
  refresh();
}

function resetFilters() {
  elements.search.value = "";
  elements.office.value = "";
  elements.branch.value = "";
  elements.representative.value = "";
  elements.status.value = "";
  elements.priority.value = "";
  elements.blocker.value = "";
  elements.createdFrom.value = "";
  elements.createdTo.value = "";
  elements.activityAge.value = "";
  elements.includeInactive.checked = false;
  state.queueFilters = {};
  elements.queueFilters.forEach((input) => {
    input.value = "";
  });
  refresh();
}

function renderItemList(title, items) {
  const content =
    items.length === 0
      ? '<li>None</li>'
      : items.map((item) => `<li>${escapeHtml(item.name)}${item.dateLabel ? `<span class="subtle">${item.dateLabel}</span>` : ""}</li>`).join("");
  return `
    <section class="detail-section">
      <h3>${escapeHtml(title)}</h3>
      <ul class="item-list">${content}</ul>
    </section>
  `;
}

function detailPair(label, value) {
  return `<div class="detail-pair"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "Blank")}</strong></div>`;
}

function openDetail(candidateId) {
  const candidate = Dashboard.getCandidateDetail(state.snapshot, candidateId);
  if (!candidate) {
    return;
  }

  elements.detailPriority.textContent = `${candidate.priority} | ${candidate.topBlocker}`;
  elements.detailName.textContent = candidate.applicant || "Unnamed candidate";
  elements.detailContent.innerHTML = `
    <section class="detail-section">
      <h3>Status</h3>
      <div class="detail-grid">
        ${detailPair("Talent ID", candidate.talentId)}
        ${detailPair("Row", candidate.rowNumber)}
        ${detailPair("Talent status", candidate.talentStatus)}
        ${detailPair("Placement status", candidate.currentPlacementStatus)}
        ${detailPair("Office", candidate.talentOffice)}
        ${detailPair("Branch", candidate.repBranch)}
        ${detailPair("Representative", candidate.talentRepresentative)}
        ${detailPair("Talent source", candidate.talentSource)}
        ${detailPair("Pipelined", candidate.pipelined ? "Yes" : "No")}
        ${detailPair("Nominated", candidate.nominated ? "Yes" : "No")}
        ${detailPair("Started", candidate.started ? "Yes" : "No")}
        ${detailPair("Resume", candidate.hasResume ? "Yes" : "No")}
      </div>
    </section>

    <section class="detail-section">
      <h3>Compliance</h3>
      <div class="detail-grid">
        ${detailPair("I-9 completed", candidate.i9Completed ? "Yes" : "No")}
        ${detailPair("I-9 validated", formatDate(candidate.i9ValidatedDate))}
        ${detailPair("E-Verify date", formatDate(candidate.eVerifyDate))}
        ${detailPair("E-Verify status", candidate.eVerifyCaseStatus)}
        ${detailPair("E-Verify result", candidate.eVerifyResult)}
        ${detailPair("E-Verify case", candidate.eVerifyCaseNumber)}
        ${detailPair("W-4 completed", candidate.w4Completed ? "Yes" : "No")}
        ${detailPair("W-2 consent", candidate.w2ElectronicConsent)}
        ${detailPair("Email consent", candidate.emailConsent)}
        ${detailPair("Text consent", candidate.textMessageConsent)}
      </div>
    </section>

    <section class="detail-section">
      <h3>Placement</h3>
      <div class="detail-grid">
        ${detailPair("Company", candidate.mostRecentCompanyPlacement)}
        ${detailPair("Job title", candidate.mostRecentJobTitlePlacement)}
        ${detailPair("Start date", formatDate(candidate.lastPlacementStartDate))}
        ${detailPair("End date", formatDate(candidate.lastPlacementEndDate))}
        ${detailPair("Created", formatDate(candidate.createdDate))}
        ${detailPair("Last activity", formatDate(candidate.lastActivityDate))}
      </div>
    </section>

    ${renderItemList("Pending tasks", candidate.pendingTasks)}
    ${renderItemList("Pending documents", candidate.pendingDocuments)}
    ${renderItemList("Completed tasks", candidate.completedTasks)}
    ${renderItemList("Completed documents", candidate.completedDocuments)}

    <section class="detail-section">
      <h3>Raw row</h3>
      <div class="detail-grid">
        ${Object.entries(candidate.raw)
          .map(([key, value]) => detailPair(key, value))
          .join("")}
      </div>
    </section>
  `;

  elements.drawer.classList.add("is-open");
  elements.drawer.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  elements.drawer.classList.remove("is-open");
  elements.drawer.setAttribute("aria-hidden", "true");
}

elements.file.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const text = await file.text();
  const snapshot = Dashboard.createDashboardFromCsv(text, { fileName: file.name });
  showDashboard(snapshot, file.name);
});

elements.clearButton.addEventListener("click", () => {
  state.snapshot = null;
  elements.file.value = "";
  elements.dashboard.hidden = true;
  elements.clearButton.hidden = true;
  closeDetail();
});

filterInputs.forEach((input) => {
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
});

elements.queueFilters.forEach((input) => {
  input.addEventListener("input", () => {
    state.queueFilters[input.dataset.queueFilter] = input.value;
    refresh();
  });
  input.addEventListener("change", () => {
    state.queueFilters[input.dataset.queueFilter] = input.value;
    refresh();
  });
});

elements.sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextKey = button.dataset.sort;
    if (state.sortKey === nextKey) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = nextKey;
      state.sortDirection = ["pending", "activity", "created"].includes(nextKey) ? "desc" : "asc";
    }
    refresh();
  });
});

elements.resetFilters.addEventListener("click", resetFilters);
elements.closeDrawer.addEventListener("click", closeDetail);
elements.drawer.addEventListener("click", (event) => {
  if (event.target === elements.drawer) {
    closeDetail();
  }
});

elements.queueBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-candidate]");
  if (button) {
    openDetail(button.dataset.candidate);
  }
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.activeView = button.dataset.view;
    document.querySelectorAll(".tab-button").forEach((tab) => tab.classList.toggle("is-active", tab === button));
    elements.queueView.hidden = state.activeView !== "queue";
    elements.breakdownView.hidden = state.activeView !== "breakdowns";
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeDetail();
  }
});
