const Dashboard = window.OnboardingDashboard;
const SAVED_UPLOAD_KEY = "onboarding-dashboard.savedUpload";
const TILE_PREFS_KEY = "onboarding-dashboard.tilePrefs";
const DEFAULT_COMPLETION_PATTERNS = [
  /form\s+i-?9/i,
  /equifax workforce solutions/i,
  /general shift\s*fillers packet 3\.20\.2026/i,
  /background check data collection form/i,
  /pre-screening/i,
  /pre-employment drug screen authorization/i,
  /contingent offer letter/i,
  /direct deposit/i,
  /emergency contact info/i,
  /symmetry tax/i,
  /background check.*consent/i,
  /consent.*background check/i,
  /various vendor background check consent forms/i,
];

const state = {
  snapshot: null,
  activeView: "queue",
  sortKey: "priority",
  sortDirection: "asc",
  queueFilters: {},
  selectedOffices: [],
  draggedTileKey: "",
  draggedTileSection: "",
  tileFilter: null,
  workflowTiles: [],
  visibleRows: [],
  suppressTileClick: false,
  tilePrefs: {
    labels: {},
    orders: {},
    completionOrders: {},
  },
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
  officeDropdown: document.getElementById("officeDropdown"),
  officeButton: document.getElementById("officeFilterButton"),
  officeMenu: document.getElementById("officeFilterMenu"),
  clearOffice: document.getElementById("clearOfficeFilter"),
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
  exportFilteredCsv: document.getElementById("exportFilteredCsv"),
  simpleExportFilteredCsv: document.getElementById("simpleExportFilteredCsv"),
  queueBody: document.getElementById("queueBody"),
  tileFilterNotice: document.getElementById("tileFilterNotice"),
  tileFilterText: document.getElementById("tileFilterText"),
  clearTileFilter: document.getElementById("clearTileFilter"),
  queueFilters: Array.from(document.querySelectorAll("[data-queue-filter]")),
  queueOptionLists: Array.from(document.querySelectorAll("[data-queue-options]")),
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

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sanitizeFilePart(value) {
  return String(value || "filtered-view")
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "filtered-view";
}

function saveUpload(fileName, csvText) {
  try {
    localStorage.setItem(
      SAVED_UPLOAD_KEY,
      JSON.stringify({
        fileName,
        csvText,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.warn("Could not save uploaded CSV for reload persistence.", error);
  }
}

function clearSavedUpload() {
  try {
    localStorage.removeItem(SAVED_UPLOAD_KEY);
  } catch (error) {
    console.warn("Could not clear saved CSV upload.", error);
  }
}

function loadTilePrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(TILE_PREFS_KEY) || "null");
    if (saved && typeof saved === "object") {
      state.tilePrefs = {
        labels: saved.labels && typeof saved.labels === "object" ? saved.labels : {},
        orders: saved.orders && typeof saved.orders === "object" ? saved.orders : {},
        completionOrders: saved.completionOrders && typeof saved.completionOrders === "object" ? saved.completionOrders : {},
      };
      if (Array.isArray(state.tilePrefs.orders.completion) && !state.tilePrefs.completionOrders.default) {
        state.tilePrefs.completionOrders.default = state.tilePrefs.orders.completion;
      }
    }
  } catch (error) {
    state.tilePrefs = { labels: {}, orders: {}, completionOrders: {} };
  }
}

function saveTilePrefs() {
  try {
    localStorage.setItem(TILE_PREFS_KEY, JSON.stringify(state.tilePrefs));
  } catch (error) {
    console.warn("Could not save dashboard tile preferences.", error);
  }
}

function restoreSavedUpload() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SAVED_UPLOAD_KEY) || "null");
  } catch (error) {
    clearSavedUpload();
    return;
  }

  if (!saved || !saved.csvText) {
    return;
  }

  try {
    const fileName = saved.fileName || "Saved upload";
    const snapshot = Dashboard.createDashboardFromCsv(saved.csvText, { fileName });
    showDashboard(snapshot, fileName);
  } catch (error) {
    console.warn("Could not restore saved CSV upload.", error);
    clearSavedUpload();
  }
}

function optionList(select, values, emptyLabel, options) {
  const settings = options || {};
  select.innerHTML = "";
  if (!settings.skipEmpty) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = emptyLabel;
    select.append(empty);
  }

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
  );
}

function renderQueueOptionList(list, values) {
  list.innerHTML = uniqueSorted(values)
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join("");
}

function renderQueueFilterOptions(snapshot) {
  const candidates = snapshot.actionQueue || [];
  const options = {
    applicant: candidates.flatMap((candidate) => [candidate.applicant, candidate.talentId]),
    status: candidates.flatMap((candidate) => [candidate.talentStatus, candidate.currentPlacementStatus]),
    office: candidates.map((candidate) => candidate.talentOffice || "Unassigned"),
    representative: candidates.map((candidate) => candidate.talentRepresentative || "Unassigned"),
    blocker: candidates.flatMap((candidate) => [candidate.topBlocker, candidate.blockerType]),
    created: candidates.map((candidate) => formatDate(candidate.createdDate)).filter((value) => value !== "Blank"),
  };

  elements.queueOptionLists.forEach((list) => {
    renderQueueOptionList(list, options[list.dataset.queueOptions] || []);
  });
}

function updateOfficeButton() {
  const count = state.selectedOffices.length;
  if (count === 0) {
    elements.officeButton.textContent = "No offices selected";
  } else if (count === 1) {
    elements.officeButton.textContent = state.selectedOffices[0];
  } else {
    elements.officeButton.textContent = `${count} offices selected`;
  }
}

function setOfficeMenuOpen(open) {
  elements.officeMenu.hidden = !open;
  elements.officeButton.setAttribute("aria-expanded", String(open));
}

function renderOfficeFilter(offices) {
  const selected = new Set(state.selectedOffices);
  elements.officeMenu.innerHTML = offices
    .map((office) => {
      const isSelected = selected.has(office);
      return `
        <button class="multi-dropdown-option ${isSelected ? "is-selected" : ""}" type="button" data-office="${escapeHtml(office)}" aria-pressed="${isSelected}">
          ${escapeHtml(office)}
        </button>
      `;
    })
    .join("");
  updateOfficeButton();
}

function toggleOfficeSelection(office, option) {
  const wasSelected = state.selectedOffices.includes(office);
  if (state.selectedOffices.includes(office)) {
    state.selectedOffices = state.selectedOffices.filter((selected) => selected !== office);
  } else {
    state.selectedOffices = state.selectedOffices.concat(office);
  }
  if (option) {
    option.classList.toggle("is-selected", !wasSelected);
    option.setAttribute("aria-pressed", String(!wasSelected));
  }
  updateOfficeButton();
  setOfficeMenuOpen(true);
  refresh();
}

function getFilters() {
  return {
    search: elements.search.value,
    offices: state.selectedOffices,
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

function hasActiveFilters(filters) {
  const selected = filters || getFilters();
  const sidebarActive =
    Boolean(String(selected.search || "").trim()) ||
    (selected.offices || []).length > 0 ||
    Boolean(selected.branch) ||
    Boolean(selected.representative) ||
    Boolean(selected.status) ||
    Boolean(selected.priority) ||
    Boolean(selected.blockerType) ||
    Boolean(selected.createdFrom) ||
    Boolean(selected.createdTo) ||
    Boolean(selected.activityAge) ||
    Boolean(selected.includeInactive);
  const queueActive = Object.values(state.queueFilters).some((value) => Boolean(String(value || "").trim()));
  return sidebarActive || queueActive;
}

function shouldShowDefaultCompletionItem(item) {
  const name = item.name || "";
  return DEFAULT_COMPLETION_PATTERNS.some((pattern) => pattern.test(name));
}

function completionOrderScope() {
  return state.selectedOffices.length === 1 ? `office:${state.selectedOffices[0]}` : "default";
}

function completionOrderKey() {
  return completionOrderScope();
}

function applyWorkflowCounts(workflowTiles, rows) {
  return Dashboard.buildWorkflowCompletionItems(rows, workflowTiles);
}

function metricFilterMatches(candidate, key) {
  const checks = {
    "metric-total-active": () => !candidate.isInactive,
    "metric-critical": () => candidate.priority === "Critical",
    "metric-high": () => candidate.priority === "High",
    "metric-pending": () => candidate.hasPending,
    "metric-stale": () => candidate.pendingAndStale,
    "metric-missing-owner": () => !candidate.talentRepresentative,
    "metric-i9-incomplete": () => !candidate.i9Completed,
    "metric-fully-vetted": () => candidate.talentStatus.toLowerCase().includes("fully vetted"),
    "metric-started": () => candidate.started,
  };
  return checks[key] ? checks[key]() : true;
}

function applyTileFilter(rows) {
  if (!state.tileFilter) {
    return rows;
  }
  const filter = state.tileFilter;
  return rows.filter((candidate) => {
    if (filter.type === "metric") {
      return metricFilterMatches(candidate, filter.key);
    }
    if (filter.type === "status") {
      return candidate.talentStatus === filter.value;
    }
    if (filter.type === "completion") {
      return Dashboard.candidateMatchesWorkflowCompletion(candidate, state.workflowTiles, filter.key, filter.status);
    }
    return true;
  });
}

function renderTileFilterNotice() {
  if (!state.tileFilter) {
    elements.tileFilterNotice.hidden = true;
    elements.tileFilterText.textContent = "";
    return;
  }
  elements.tileFilterNotice.hidden = false;
  const suffix = hasActiveFilters(getFilters()) ? " plus current filters" : "";
  elements.tileFilterText.textContent = `Filtered view: ${state.tileFilter.label}${suffix}`;
}

function scrollToFilteredView() {
  elements.tileFilterNotice.scrollIntoView({ behavior: "smooth", block: "start" });
}

function defaultCompletionDisplayItems(items) {
  const grouped = [];
  const consentGroup = {
    name: "Various Vendor Background Check Consent Forms",
    completed: 0,
    incomplete: 0,
    groupedNames: [],
  };

  items.forEach((item) => {
    if (/background check.*consent/i.test(item.name) || /consent.*background check/i.test(item.name)) {
      consentGroup.completed += item.completed;
      consentGroup.incomplete += item.incomplete;
      consentGroup.groupedNames.push(item.name);
    } else {
      grouped.push(item);
    }
  });

  if (consentGroup.completed > 0 || consentGroup.incomplete > 0) {
    grouped.push(consentGroup);
  }

  return grouped;
}

function getQueueFilterValue(key) {
  return String(state.queueFilters[key] || "").trim().toLowerCase();
}

function getPendingTotal(candidate) {
  return candidate.pendingTasks.length + candidate.pendingDocuments.length;
}

function applicantUrl(candidate) {
  if (!candidate.talentId) {
    return "";
  }
  return `https://shiftfillers.myavionte.com/app/#/applicant/${encodeURIComponent(candidate.talentId)}/`;
}

function exportFileName(prefix) {
  const base = sanitizeFilePart(elements.reportTitle.textContent);
  const scope = state.tileFilter ? sanitizeFilePart(state.tileFilter.label) : "filtered-view";
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const exportType = prefix ? `${sanitizeFilePart(prefix)}-` : "";
  return `${base}-${exportType}${scope}-${timestamp}.csv`;
}

function buildFilteredCsv(rows) {
  const rawHeaders = state.snapshot?.headers || [];
  const calculatedHeaders = [
    "Dashboard Priority",
    "Dashboard Top Blocker",
    "Dashboard Blocker Type",
    "Dashboard Pending Items",
    "Dashboard Last Activity Age Days",
    "Dashboard Row Number",
    "Applicant Link",
  ];
  const headers = calculatedHeaders.concat(rawHeaders);
  const lines = [headers.map(csvCell).join(",")];

  rows.forEach((candidate) => {
    const calculatedValues = [
      candidate.priority,
      candidate.topBlocker,
      candidate.blockerType,
      getPendingTotal(candidate),
      candidate.lastActivityAgeDays === null ? "" : candidate.lastActivityAgeDays,
      candidate.rowNumber,
      applicantUrl(candidate),
    ];
    const rawValues = rawHeaders.map((header) => candidate.raw[header] || "");
    lines.push(calculatedValues.concat(rawValues).map(csvCell).join(","));
  });

  return lines.join("\r\n");
}

function buildSimpleFilteredCsv(rows) {
  const headers = ["Applicant Link", "Applicant", "Talent ID", "Talent Status", "Current Placement Status"];
  const lines = [headers.map(csvCell).join(",")];

  rows.forEach((candidate) => {
    lines.push(
      [
        applicantUrl(candidate),
        candidate.applicant,
        candidate.talentId,
        candidate.talentStatus,
        candidate.currentPlacementStatus,
      ]
        .map(csvCell)
        .join(","),
    );
  });

  return lines.join("\r\n");
}

function downloadCsv(csv, fileName) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportFilteredCsv() {
  const rows = state.visibleRows || [];
  if (!state.snapshot || rows.length === 0) {
    return;
  }

  const csv = buildFilteredCsv(rows);
  downloadCsv(csv, exportFileName());
}

function exportSimpleFilteredCsv() {
  const rows = state.visibleRows || [];
  if (!state.snapshot || rows.length === 0) {
    return;
  }

  const csv = buildSimpleFilteredCsv(rows);
  downloadCsv(csv, exportFileName("simple-export"));
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

function tileLabel(tile) {
  return state.tilePrefs.labels[tile.key] || tile.label;
}

function orderedTiles(section, tiles) {
  const order =
    section === "completion"
      ? state.tilePrefs.completionOrders[completionOrderKey()] || []
      : state.tilePrefs.orders[section] || [];
  const indexByKey = new Map(order.map((key, index) => [key, index]));
  return tiles.slice().sort((a, b) => {
    const left = indexByKey.has(a.key) ? indexByKey.get(a.key) : Number.MAX_SAFE_INTEGER;
    const right = indexByKey.has(b.key) ? indexByKey.get(b.key) : Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function renderTileLabel(tile, editable) {
  return editable
    ? `<span class="tile-title" contenteditable="true" spellcheck="false" data-tile-label="${escapeHtml(tile.key)}">${escapeHtml(tileLabel(tile))}</span>`
    : `<span class="tile-title">${escapeHtml(tileLabel(tile))}</span>`;
}

function saveTileOrder(section) {
  const list = elements.summaryCards.querySelector(`[data-tile-list="${section}"]`);
  if (!list) {
    return;
  }
  const order = Array.from(list.querySelectorAll("[data-tile-key]")).map((tile) => tile.dataset.tileKey);
  if (section === "completion") {
    state.tilePrefs.completionOrders[completionOrderKey()] = order;
  } else {
    state.tilePrefs.orders[section] = order;
  }
  saveTilePrefs();
}

function moveTileBeforeDropTarget(tile, target, event) {
  const list = target.parentElement;
  if (!list || tile === target || tile.parentElement !== list) {
    return;
  }
  const bounds = target.getBoundingClientRect();
  const before = event.clientY < bounds.top + bounds.height / 2 || event.clientX < bounds.left + bounds.width / 2;
  list.insertBefore(tile, before ? target : target.nextSibling);
}

function renderSummary(summary, options) {
  const settings = options || {};
  const metricCards = [
    { key: "metric-total-active", label: "Total active candidates", value: summary.totalActiveCandidates, note: "", tone: "info" },
    { key: "metric-critical", label: "Critical", value: summary.critical, note: "candidates", tone: "critical" },
    { key: "metric-high", label: "High", value: summary.high, note: "candidates", tone: "high" },
    { key: "metric-pending", label: "Pending", value: summary.pending, note: "candidates", tone: "high" },
    { key: "metric-stale", label: "Stale", value: summary.stale, note: "over 7 days or blank", tone: "high" },
    { key: "metric-missing-owner", label: "Missing owner", value: summary.missingOwner, note: "candidates", tone: "info" },
    { key: "metric-i9-incomplete", label: "I-9 incomplete", value: summary.i9Incomplete, note: "candidates", tone: "critical" },
    { key: "metric-fully-vetted", label: "Fully vetted", value: summary.fullyVetted, note: "candidates", tone: "good" },
    { key: "metric-started", label: "Started", value: summary.started, note: "candidates", tone: "good" },
  ];
  const statusCards = (summary.statusCounts || []).map((status) => ({
    key: `status-${status.name}`,
    label: status.name,
    value: status.count,
    note: "status",
    tone: "",
  }));

  const renderMetricCard = (tile, section) => `
        <article class="metric-card ${tile.tone}" draggable="true" data-tile-section="${section}" data-tile-key="${escapeHtml(tile.key)}" data-filter-type="${section === "statuses" ? "status" : "metric"}" data-filter-value="${escapeHtml(section === "statuses" ? tile.label : tile.key)}" data-filter-label="${escapeHtml(tileLabel(tile))}">
          ${renderTileLabel(tile, true)}
          <strong>${formatNumber(tile.value)}</strong>
          <span>${escapeHtml(tile.note)}</span>
        </article>
      `;

  const completionItems = settings.showAllCompletionItems
    ? summary.completionItems || []
    : defaultCompletionDisplayItems((summary.completionItems || []).filter(shouldShowDefaultCompletionItem));
  const completionTiles = completionItems.map((item) => ({
    key: `completion-${item.name}`,
    label: item.name,
    completed: 0,
    incomplete: 0,
    names: item.groupedNames && item.groupedNames.length ? item.groupedNames : [item.name],
    groupedNames: item.groupedNames || [],
  }));
  const workflowTiles = applyWorkflowCounts(orderedTiles("completion", completionTiles), settings.workflowRows || []);
  state.workflowTiles = workflowTiles;
  const completionMarkup =
    workflowTiles.length === 0
      ? '<div class="completion-empty">No task or document completion items found.</div>'
      : workflowTiles
          .map(
            (tile) => `
              <article class="completion-card" draggable="true" data-tile-section="completion" data-tile-key="${escapeHtml(tile.key)}">
                <strong title="${escapeHtml(tile.label)}">${renderTileLabel(tile, false)}</strong>
                <div class="completion-stack">
                  <button type="button" data-filter-type="completion" data-filter-status="completed" data-filter-key="${escapeHtml(tile.key)}" data-filter-label="${escapeHtml(`${tileLabel(tile)} - Completed`)}"><span>Completed</span><b>${formatNumber(tile.completed)}</b></button>
                  <button type="button" data-filter-type="completion" data-filter-status="incomplete" data-filter-key="${escapeHtml(tile.key)}" data-filter-label="${escapeHtml(`${tileLabel(tile)} - Incomplete`)}"><span>Incomplete</span><b>${formatNumber(tile.incomplete)}</b></button>
                </div>
                ${
                  tile.groupedNames.length
                    ? `<details class="completion-details"><summary>Included forms</summary><ul>${tile.groupedNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul></details>`
                    : ""
                }
              </article>
            `,
          )
          .join("");

  elements.summaryCards.innerHTML = `
    <section class="summary-section" aria-label="Candidate metrics">
      <div class="summary-row" data-tile-list="metrics">
        ${orderedTiles("metrics", metricCards).map((tile) => renderMetricCard(tile, "metrics")).join("")}
      </div>
    </section>
    <section class="summary-section" aria-label="Talent statuses">
      <div class="summary-section-heading">
        <p class="eyebrow">Talent statuses</p>
      </div>
      <div class="summary-row" data-tile-list="statuses">
        ${orderedTiles("statuses", statusCards).map((tile) => renderMetricCard(tile, "statuses")).join("")}
      </div>
    </section>
    <section class="summary-section" aria-label="Task and document completion">
      <div class="summary-section-heading">
        <p class="eyebrow">Tasks and documents</p>
        <h2>Completion</h2>
      </div>
      <div class="completion-grid" data-tile-list="completion">
        ${completionMarkup}
      </div>
    </section>
  `;
}

function renderFilters(snapshot) {
  const options = Dashboard.getFilterOptions(snapshot);
  renderOfficeFilter(options.offices);
  optionList(elements.branch, options.branches, "All branches");
  optionList(elements.representative, options.representatives, "All reps");
  optionList(elements.status, options.statuses, "All statuses");
  optionList(elements.priority, options.priorities, "All priorities");
  optionList(elements.blocker, options.blockerTypes, "All blockers");
  renderQueueFilterOptions(snapshot);
}

function renderQueue(rows) {
  elements.queueCount.textContent = `${formatNumber(rows.length)} candidates`;
  elements.exportFilteredCsv.disabled = rows.length === 0;
  elements.simpleExportFilteredCsv.disabled = rows.length === 0;

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
      (candidate) => {
        const url = applicantUrl(candidate);
        const applicantName = escapeHtml(candidate.applicant || "Unnamed");
        const applicantLink = url
          ? `<a class="row-link" href="${url}" target="_blank" rel="noopener noreferrer">${applicantName}</a>`
          : `<button class="row-button" type="button" data-candidate="${candidate.id}">${applicantName}</button>`;
        return `
        <tr>
          <td><span class="badge ${candidate.priority}">${candidate.priority}</span></td>
          <td>
            ${applicantLink}
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
      `;
      },
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

  const filters = getFilters();
  const baseRows = applyQueueColumnFilters(Dashboard.applyDashboardFilters(state.snapshot, filters));
  renderSortButtons();
  renderTileFilterNotice();
  renderSummary(Dashboard.buildFilteredSummary(baseRows), {
    showAllCompletionItems: hasActiveFilters(filters),
    workflowRows: baseRows,
  });
  const rows = sortQueueRows(applyTileFilter(baseRows));
  state.visibleRows = rows;
  renderQueue(rows);
}

function showDashboard(snapshot, fileName) {
  state.snapshot = snapshot;
  state.selectedOffices = [];
  setOfficeMenuOpen(false);
  elements.dashboard.hidden = false;
  elements.clearButton.hidden = false;
  elements.reportTitle.textContent = fileName || "Uploaded report";
  elements.rowCount.textContent = `${formatNumber(snapshot.parsedRowCount)} rows`;
  elements.columnCount.textContent = `${formatNumber(snapshot.parsedColumnCount)} columns`;
  elements.reportDate.textContent = snapshot.reportDate;
  renderFilters(snapshot);
  renderBreakdowns(snapshot);
  refresh();
}

function resetFilters() {
  elements.search.value = "";
  state.selectedOffices = [];
  renderOfficeFilter(Dashboard.getFilterOptions(state.snapshot).offices);
  setOfficeMenuOpen(false);
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
  state.tileFilter = null;
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
  saveUpload(file.name, text);
  showDashboard(snapshot, file.name);
});

elements.clearButton.addEventListener("click", () => {
  state.snapshot = null;
  state.selectedOffices = [];
  state.tileFilter = null;
  state.visibleRows = [];
  elements.officeMenu.innerHTML = "";
  updateOfficeButton();
  setOfficeMenuOpen(false);
  elements.file.value = "";
  elements.dashboard.hidden = true;
  elements.clearButton.hidden = true;
  clearSavedUpload();
  closeDetail();
});

filterInputs.forEach((input) => {
  input.addEventListener("input", refresh);
  input.addEventListener("change", refresh);
});

elements.officeButton.addEventListener("click", () => {
  setOfficeMenuOpen(elements.officeButton.getAttribute("aria-expanded") !== "true");
});

elements.officeMenu.addEventListener("click", (event) => {
  const option = event.target.closest("[data-office]");
  if (!option) {
    return;
  }
  toggleOfficeSelection(option.dataset.office, option);
});

elements.clearOffice.addEventListener("click", () => {
  state.selectedOffices = [];
  if (state.snapshot) {
    renderOfficeFilter(Dashboard.getFilterOptions(state.snapshot).offices);
  }
  setOfficeMenuOpen(false);
  refresh();
});

document.addEventListener("click", (event) => {
  if (!elements.officeDropdown.contains(event.target) && event.target !== elements.clearOffice) {
    setOfficeMenuOpen(false);
  }
});

elements.summaryCards.addEventListener("dragstart", (event) => {
  const tile = event.target.closest("[data-tile-key]");
  if (!tile) {
    return;
  }
  state.suppressTileClick = true;
  state.draggedTileKey = tile.dataset.tileKey;
  state.draggedTileSection = tile.dataset.tileSection;
  tile.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", tile.dataset.tileKey);
});

elements.summaryCards.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-tile-key]");
  if (!target || !state.draggedTileKey) {
    return;
  }
  const dragged = Array.from(elements.summaryCards.querySelectorAll("[data-tile-key]")).find((tile) => tile.dataset.tileKey === state.draggedTileKey);
  if (!dragged || dragged.dataset.tileSection !== target.dataset.tileSection) {
    return;
  }
  event.preventDefault();
  moveTileBeforeDropTarget(dragged, target, event);
});

elements.summaryCards.addEventListener("drop", (event) => {
  const tile = event.target.closest("[data-tile-key]");
  if (!tile || !state.draggedTileKey) {
    return;
  }
  event.preventDefault();
  saveTileOrder(tile.dataset.tileSection);
});

elements.summaryCards.addEventListener("dragend", () => {
  if (state.draggedTileSection) {
    saveTileOrder(state.draggedTileSection);
  }
  elements.summaryCards.querySelectorAll(".is-dragging").forEach((tile) => tile.classList.remove("is-dragging"));
  state.draggedTileKey = "";
  state.draggedTileSection = "";
  setTimeout(() => {
    state.suppressTileClick = false;
  }, 0);
});

elements.summaryCards.addEventListener("click", (event) => {
  if (state.suppressTileClick || event.target.closest("[contenteditable]") || event.target.closest("summary")) {
    return;
  }
  const filterTarget = event.target.closest("[data-filter-type]");
  if (!filterTarget) {
    return;
  }

  const type = filterTarget.dataset.filterType;
  const label = filterTarget.dataset.filterLabel || filterTarget.dataset.filterValue || "Selected tile";
  if (type === "metric") {
    state.tileFilter = {
      type,
      key: filterTarget.dataset.filterValue,
      label,
    };
  } else if (type === "status") {
    state.tileFilter = {
      type,
      value: filterTarget.dataset.filterValue,
      label,
    };
  } else if (type === "completion") {
    state.tileFilter = {
      type,
      key: filterTarget.dataset.filterKey,
      status: filterTarget.dataset.filterStatus,
      label,
    };
  }

  refresh();
  scrollToFilteredView();
});

elements.summaryCards.addEventListener("blur", (event) => {
  const label = event.target.closest("[data-tile-label]");
  if (!label) {
    return;
  }
  const key = label.dataset.tileLabel;
  const text = label.textContent.trim();
  if (text) {
    state.tilePrefs.labels[key] = text;
  } else {
    delete state.tilePrefs.labels[key];
  }
  saveTilePrefs();
}, true);

elements.clearTileFilter.addEventListener("click", () => {
  state.tileFilter = null;
  refresh();
});

elements.exportFilteredCsv.addEventListener("click", exportFilteredCsv);
elements.simpleExportFilteredCsv.addEventListener("click", exportSimpleFilteredCsv);

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

loadTilePrefs();
restoreSavedUpload();
