(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.OnboardingDashboard = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const EXPECTED_COLUMNS = [
    "Talent Office",
    "Talent ID",
    "Applicant",
    "Rep Branch",
    "Last Name",
    "First Name",
    "Talent Status",
    "Current Placement Status",
    "Talent Representative",
    "Resume",
    "W4 Completed",
    "W-2 Electronic Consent",
    "Expressed Email Consent",
    "Text Message Consent",
    "I9 Completed",
    "I9 Validated Date",
    "Past Job Count",
    "Skill Code Count",
    "Pending Count",
    "Completed Count",
    "Pending Tasks",
    "Completed Tasks",
    "Pending Documents",
    "Completed Documents",
    "Sent Talent Contracts",
    "Signed Talent Contracts",
    "Last Interviewer",
    "Last Interview Date",
    "Talent Created Date",
    "Talent Last Activity Date",
    "Last Placement Start Date",
    "Last Placement End Date",
    "Talent Source",
    "EVerify Date",
    "Everify Case Number",
    "Everify Result",
    "Everify Case Status",
    "Pipelined",
    "Nominated",
    "Started",
    "Most Recent Company Placement",
    "Most Recent Job Title Placement",
    "Work Authorization Expiration Date",
  ];

  const HIDDEN_BY_DEFAULT = [
    "Last Interviewer",
    "Last Interview Date",
    "Sent Talent Contracts",
    "Signed Talent Contracts",
    "Work Authorization Expiration Date",
  ];

  const PRIORITY_ORDER = {
    Critical: 0,
    High: 1,
    Medium: 2,
    Info: 3,
  };

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(value);
        value = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }
        row.push(value);
        if (row.some((cell) => cell !== "")) {
          rows.push(row);
        }
        row = [];
        value = "";
        continue;
      }

      value += char;
    }

    if (value.length > 0 || row.length > 0) {
      row.push(value);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
    }

    if (rows.length === 0) {
      return { headers: [], records: [] };
    }

    const headers = rows[0].map((header) => header.trim());
    const records = rows.slice(1).map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = (cells[index] || "").trim();
      });
      return record;
    });

    return { headers, records };
  }

  function parseNumber(value) {
    const number = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(number) ? number : 0;
  }

  function parseDate(value) {
    if (!value || !String(value).trim()) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  function formatIsoDate(date) {
    if (!date) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysBetween(later, earlier) {
    if (!later || !earlier) {
      return null;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const start = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
    const end = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
    return Math.floor((end - start) / msPerDay);
  }

  function inferReportTimestamp(fileName, fallbackDate) {
    const match = String(fileName || "").match(/(\d{4})(\d{2})(\d{2})[_-](\d{1,2})(\d{2})(AM|PM)/i);
    if (!match) {
      return fallbackDate || new Date();
    }

    let hour = Number(match[4]);
    const minute = Number(match[5]);
    const meridiem = match[6].toUpperCase();
    if (meridiem === "PM" && hour < 12) {
      hour += 12;
    }
    if (meridiem === "AM" && hour === 12) {
      hour = 0;
    }

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hour, minute);
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function yes(value) {
    return /^yes$/i.test(normalizeText(value));
  }

  function isBlank(value) {
    return normalizeText(value) === "";
  }

  function splitListWithDates(value) {
    const text = normalizeText(value);
    if (!text) {
      return [];
    }

    return text
      .split(/\s,\s*/g)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const match = part.match(/\s-\s(\d{1,2}\/\d{1,2}\/\d{4})$/);
        const date = match ? parseDate(match[1]) : null;
        const name = match ? part.slice(0, match.index).trim() : part;
        return {
          name,
          date,
          dateLabel: date ? formatIsoDate(date) : "",
          raw: part,
        };
      });
  }

  function isInactiveStatus(status) {
    const text = normalizeText(status).toLowerCase();
    return (
      text.startsWith("*5.") ||
      text.startsWith("*6.") ||
      /inactive|not interested|not qualified|terminated|not reachable|does not meet|ncns|dna|dnu|no longer available|ineligible/.test(text)
    );
  }

  function isEarlyApplicant(candidate) {
    const status = candidate.talentStatus.toLowerCase();
    return (
      /online applicant|^applicant$|incomplete applicant/.test(status) &&
      !candidate.started &&
      !candidate.nominated &&
      !candidate.pipelined
    );
  }

  function hasI9Pending(candidate) {
    const items = candidate.pendingTasks.concat(candidate.pendingDocuments);
    return items.some((item) => /i-?9|equifax workforce solutions/i.test(item.name));
  }

  function hasPendingItems(candidate) {
    return candidate.pendingCount > 0 || candidate.pendingTasks.length > 0 || candidate.pendingDocuments.length > 0;
  }

  function determinePriority(candidate) {
    const blockers = [];
    const isActiveOrVetted =
      candidate.started ||
      candidate.currentPlacementStatus.toLowerCase() === "active contractor" ||
      candidate.talentStatus.toLowerCase().includes("active contractor") ||
      candidate.talentStatus.toLowerCase().includes("fully vetted");
    const missingI9 = !candidate.i9Completed;
    const missingEVerify = !candidate.eVerifyDate;
    const pendingI9 = hasI9Pending(candidate);
    const complianceStage = /compliance review|i-9 in process/i.test(candidate.talentStatus);

    if (isActiveOrVetted && (missingI9 || missingEVerify)) {
      if (missingI9) {
        blockers.push({ priority: "Critical", type: "I-9", label: "I-9 incomplete for active/vetted candidate" });
      } else {
        blockers.push({ priority: "Critical", type: "E-Verify", label: "E-Verify missing for active/vetted candidate" });
      }
    }

    if (complianceStage && (pendingI9 || candidate.pendingDocuments.length > 0)) {
      blockers.push({ priority: "High", type: pendingI9 ? "I-9" : "Pending documents", label: pendingI9 ? "I-9 pending in compliance stage" : "Documents pending in compliance stage" });
    }

    if (candidate.pendingAndStale) {
      blockers.push({ priority: "High", type: "Stale activity", label: "Pending items with stale activity" });
    }

    if (!candidate.isInactive && !isEarlyApplicant(candidate)) {
      if (candidate.pendingTasks.length > 0) {
        blockers.push({ priority: "Medium", type: "Pending tasks", label: "Onboarding tasks pending" });
      }
      if (candidate.pendingDocuments.length > 0) {
        blockers.push({ priority: "Medium", type: "Pending documents", label: "Documents pending" });
      }
      if (!candidate.hasResume) {
        blockers.push({ priority: "Medium", type: "Resume", label: "Resume missing" });
      }
      if (!candidate.talentRepresentative) {
        blockers.push({ priority: "Medium", type: "Missing owner", label: "Talent representative missing" });
      }
      if (!candidate.lastActivityDate) {
        blockers.push({ priority: "Medium", type: "Stale activity", label: "Last activity date missing" });
      }
    }

    if (blockers.length === 0 && isEarlyApplicant(candidate)) {
      blockers.push({ priority: "Info", type: "Early applicant", label: "Early applicant stage" });
    }

    if (blockers.length === 0) {
      blockers.push({ priority: "Info", type: "Complete", label: "No immediate blocker" });
    }

    blockers.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    return {
      priority: blockers[0].priority,
      blockerType: blockers[0].type,
      topBlocker: blockers[0].label,
      blockers,
    };
  }

  function normalizeCandidate(raw, index, reportDate) {
    const pendingTasks = splitListWithDates(raw["Pending Tasks"]);
    const pendingDocuments = splitListWithDates(raw["Pending Documents"]);
    const completedTasks = splitListWithDates(raw["Completed Tasks"]);
    const completedDocuments = splitListWithDates(raw["Completed Documents"]);
    const createdDate = parseDate(raw["Talent Created Date"]);
    const lastActivityDate = parseDate(raw["Talent Last Activity Date"]);
    const i9ValidatedDate = parseDate(raw["I9 Validated Date"]);
    const eVerifyDate = parseDate(raw["EVerify Date"]);
    const lastPlacementStartDate = parseDate(raw["Last Placement Start Date"]);
    const lastPlacementEndDate = parseDate(raw["Last Placement End Date"]);
    const lastActivityAgeDays = lastActivityDate ? daysBetween(reportDate, lastActivityDate) : null;
    const pendingCount = parseNumber(raw["Pending Count"]);
    const pendingBase = {
      rowNumber: index + 2,
      id: `row-${index + 2}`,
      applicant: normalizeText(raw.Applicant) || [raw["First Name"], raw["Last Name"]].map(normalizeText).filter(Boolean).join(" "),
      talentId: normalizeText(raw["Talent ID"]),
      firstName: normalizeText(raw["First Name"]),
      lastName: normalizeText(raw["Last Name"]),
      talentOffice: normalizeText(raw["Talent Office"]),
      repBranch: normalizeText(raw["Rep Branch"]),
      talentRepresentative: normalizeText(raw["Talent Representative"]),
      talentStatus: normalizeText(raw["Talent Status"]),
      currentPlacementStatus: normalizeText(raw["Current Placement Status"]),
      talentSource: normalizeText(raw["Talent Source"]),
      hasResume: yes(raw.Resume),
      i9Completed: yes(raw["I9 Completed"]),
      i9ValidatedDate,
      eVerifyDate,
      eVerifyCaseNumber: normalizeText(raw["Everify Case Number"]),
      eVerifyResult: normalizeText(raw["Everify Result"]),
      eVerifyCaseStatus: normalizeText(raw["Everify Case Status"]),
      w4Completed: yes(raw["W4 Completed"]),
      w2ElectronicConsent: normalizeText(raw["W-2 Electronic Consent"]),
      emailConsent: normalizeText(raw["Expressed Email Consent"]),
      textMessageConsent: normalizeText(raw["Text Message Consent"]),
      pipelined: yes(raw.Pipelined),
      nominated: yes(raw.Nominated),
      started: yes(raw.Started),
      pendingCount,
      completedCount: parseNumber(raw["Completed Count"]),
      pendingTasks,
      pendingDocuments,
      completedTasks,
      completedDocuments,
      pastJobCount: parseNumber(raw["Past Job Count"]),
      skillCodeCount: parseNumber(raw["Skill Code Count"]),
      createdDate,
      lastActivityDate,
      lastActivityAgeDays,
      lastPlacementStartDate,
      lastPlacementEndDate,
      mostRecentCompanyPlacement: normalizeText(raw["Most Recent Company Placement"]),
      mostRecentJobTitlePlacement: normalizeText(raw["Most Recent Job Title Placement"]),
      isInactive: isInactiveStatus(raw["Talent Status"]),
      raw,
    };

    pendingBase.hasPending = hasPendingItems(pendingBase);
    pendingBase.pendingAndStale = pendingBase.hasPending && (!lastActivityDate || lastActivityAgeDays > 7);
    pendingBase.defaultVisible = !pendingBase.isInactive;

    const priority = determinePriority(pendingBase);
    return Object.assign(pendingBase, priority);
  }

  function groupCounts(items, selector) {
    const map = new Map();
    items.forEach((item) => {
      const key = selector(item) || "Unassigned";
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function summarizeOffice(items) {
    const map = new Map();
    items.forEach((candidate) => {
      const key = candidate.talentOffice || "Unassigned";
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          count: 0,
          critical: 0,
          high: 0,
          pendingAndStale: 0,
          missingOwner: 0,
        });
      }
      const office = map.get(key);
      office.count += 1;
      if (candidate.priority === "Critical") {
        office.critical += 1;
      }
      if (candidate.priority === "High") {
        office.high += 1;
      }
      if (candidate.pendingAndStale) {
        office.pendingAndStale += 1;
      }
      if (!candidate.talentRepresentative) {
        office.missingOwner += 1;
      }
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function buildWarnings(headers, records) {
    const warnings = [];
    const missing = EXPECTED_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
      warnings.push({
        type: "missing-columns",
        label: `${missing.length} expected columns missing`,
        details: missing,
      });
    }

    const blankHeavy = headers
      .map((header) => {
        const blank = records.filter((record) => isBlank(record[header])).length;
        const pct = records.length ? Math.round((blank / records.length) * 1000) / 10 : 0;
        return { column: header, blank, populated: records.length - blank, blankPct: pct };
      })
      .filter((column) => column.blankPct >= 95)
      .sort((a, b) => b.blankPct - a.blankPct);

    if (blankHeavy.length > 0) {
      warnings.push({
        type: "blank-heavy-columns",
        label: `${blankHeavy.length} columns are at least 95% blank`,
        details: blankHeavy,
      });
    }

    return warnings;
  }

  function buildSummary(candidates) {
    return {
      totalCandidates: candidates.length,
      activeCandidates: candidates.filter((candidate) => !candidate.isInactive).length,
      criticalActionItems: candidates.filter((candidate) => candidate.priority === "Critical").length,
      highActionItems: candidates.filter((candidate) => candidate.priority === "High").length,
      pendingAndStale: candidates.filter((candidate) => candidate.pendingAndStale).length,
      missingOwner: candidates.filter((candidate) => !candidate.talentRepresentative).length,
      i9Incomplete: candidates.filter((candidate) => !candidate.i9Completed).length,
      eVerifyMissing: candidates.filter((candidate) => !candidate.eVerifyDate).length,
      fullyVettedStarted: candidates.filter((candidate) => candidate.started || candidate.talentStatus.toLowerCase().includes("fully vetted")).length,
      withPendingItems: candidates.filter((candidate) => candidate.hasPending).length,
    };
  }

  function createDashboardFromCsv(csvText, options) {
    const settings = options || {};
    const parsed = parseCsv(csvText);
    const reportTimestamp = inferReportTimestamp(settings.fileName, settings.fallbackDate || new Date());
    const reportDate = new Date(reportTimestamp.getFullYear(), reportTimestamp.getMonth(), reportTimestamp.getDate());
    const candidates = parsed.records.map((record, index) => normalizeCandidate(record, index, reportDate));
    const summary = buildSummary(candidates);
    const warnings = buildWarnings(parsed.headers, parsed.records);
    const uploadId = `upload-${reportTimestamp.getTime()}-${parsed.records.length}`;

    return {
      uploadId,
      reportTimestamp: reportTimestamp.toISOString(),
      reportDate: formatIsoDate(reportDate),
      parsedRowCount: parsed.records.length,
      parsedColumnCount: parsed.headers.length,
      schemaWarnings: warnings.filter((warning) => warning.type === "missing-columns"),
      summary,
      actionQueue: candidates
        .slice()
        .sort((a, b) => {
          const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          const staleDiff = Number(b.pendingAndStale) - Number(a.pendingAndStale);
          if (staleDiff !== 0) {
            return staleDiff;
          }
          return (b.lastActivityAgeDays || 0) - (a.lastActivityAgeDays || 0);
        }),
      blockerBreakdown: groupCounts(candidates, (candidate) => candidate.blockerType),
      statusFunnel: groupCounts(candidates, (candidate) => candidate.talentStatus || "No status"),
      officeBreakdown: summarizeOffice(candidates),
      dataQualityWarnings: warnings,
      hiddenByDefault: HIDDEN_BY_DEFAULT,
      headers: parsed.headers,
    };
  }

  function getCandidateDetail(snapshot, candidateId) {
    return snapshot.actionQueue.find((candidate) => candidate.id === candidateId) || null;
  }

  function getFilterOptions(snapshot) {
    const candidates = snapshot.actionQueue || [];
    const unique = (selector) =>
      Array.from(new Set(candidates.map(selector).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return {
      offices: unique((candidate) => candidate.talentOffice),
      branches: unique((candidate) => candidate.repBranch),
      representatives: unique((candidate) => candidate.talentRepresentative),
      statuses: unique((candidate) => candidate.talentStatus),
      priorities: ["Critical", "High", "Medium", "Info"],
      blockerTypes: unique((candidate) => candidate.blockerType),
    };
  }

  function applyDashboardFilters(snapshot, filters) {
    const selected = filters || {};
    const search = normalizeText(selected.search).toLowerCase();
    const createdFrom = parseDate(selected.createdFrom);
    const createdTo = parseDate(selected.createdTo);

    return (snapshot.actionQueue || []).filter((candidate) => {
      if (!selected.includeInactive && candidate.isInactive) {
        return false;
      }
      if (selected.office && candidate.talentOffice !== selected.office) {
        return false;
      }
      if (selected.branch && candidate.repBranch !== selected.branch) {
        return false;
      }
      if (selected.representative && candidate.talentRepresentative !== selected.representative) {
        return false;
      }
      if (selected.status && candidate.talentStatus !== selected.status) {
        return false;
      }
      if (selected.priority && candidate.priority !== selected.priority) {
        return false;
      }
      if (selected.blockerType && candidate.blockerType !== selected.blockerType) {
        return false;
      }
      if (createdFrom && (!candidate.createdDate || candidate.createdDate < createdFrom)) {
        return false;
      }
      if (createdTo && (!candidate.createdDate || candidate.createdDate > createdTo)) {
        return false;
      }
      if (selected.activityAge === "stale7" && !(candidate.lastActivityAgeDays === null || candidate.lastActivityAgeDays > 7)) {
        return false;
      }
      if (selected.activityAge === "stale14" && !(candidate.lastActivityAgeDays === null || candidate.lastActivityAgeDays > 14)) {
        return false;
      }
      if (selected.activityAge === "blank" && candidate.lastActivityDate) {
        return false;
      }
      if (search) {
        const haystack = [
          candidate.applicant,
          candidate.talentId,
          candidate.talentOffice,
          candidate.talentRepresentative,
          candidate.talentStatus,
          candidate.topBlocker,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      return true;
    });
  }

  return {
    EXPECTED_COLUMNS,
    HIDDEN_BY_DEFAULT,
    PRIORITY_ORDER,
    applyDashboardFilters,
    createDashboardFromCsv,
    formatIsoDate,
    getCandidateDetail,
    getFilterOptions,
    inferReportTimestamp,
    parseCsv,
    splitListWithDates,
  };
});
