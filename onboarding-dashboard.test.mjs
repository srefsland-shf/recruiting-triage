import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Dashboard = require("./dashboard-core.js");

const reportPath =
  process.argv[2] ||
  "C:/Users/sheld/Downloads/Onboarding-Compliance-Report_20260514_1120AM.csv";

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

const inlineCsv = [
  [
    "Talent Status",
    "Current Placement Status",
    "Talent Representative",
    "W4 Completed",
    "I9 Completed",
    "Pending Count",
    "Pending Tasks",
    "Completed Tasks",
    "Pending Documents",
    "Completed Documents",
    "Started",
    "Talent Last Activity Date",
    "Applicant",
    "Talent ID",
    "Resume",
    "EVerify Date",
    "Pipelined",
    "Nominated",
    "Talent Created Date",
    "Talent Office",
    "Rep Branch",
  ].join(","),
  'Fully Vetted,,Owner,Yes,Yes,1,"Badge , I-9 Form",Badge,"ID Doc , Vendor A Background Check Consent Form",ID Doc,Yes,05/01/2026,A,1,Yes,05/02/2026,No,No,05/01/2026,Office,Branch',
  'Compliance Review,, ,Yes,No,1,Personal Info,"Vendor B Background Check Consent",,"W-4",No,,B,2,Yes,,No,No,05/01/2026,Office,Branch',
  'Compliance Review,,Owner,Yes,Yes,2,"Personal Info , W-4",Badge,,,No,05/02/2026,E,5,Yes,05/02/2026,No,No,05/01/2026,Office,Branch',
  '*5. Inactive,, ,No,No,1,Personal Info,,,,No,,C,3,No,,No,No,05/01/2026,Office,Branch',
  'Active Contractor,Active Contractor,Owner,Yes,No,0,,,,,No,05/13/2026,D,4,Yes,,No,No,05/01/2026,Second Office,Branch',
].join("\n");

const inlineSnapshot = Dashboard.createDashboardFromCsv(inlineCsv, {
  fileName: "Onboarding-Compliance-Report_20260514_1120AM.csv",
  fallbackDate: new Date(2026, 4, 14),
});

const nameFormatCsv = [
  "Applicant,First Name,Last Name,Talent Status,Talent ID,Talent Created Date",
  "Freeman Kristin,Kristin,Freeman,Online Applicant,123,05/01/2026",
].join("\n");
const nameFormatSnapshot = Dashboard.createDashboardFromCsv(nameFormatCsv, {
  fileName: "Onboarding-Compliance-Report_20260514_1120AM.csv",
  fallbackDate: new Date(2026, 4, 14),
});
assertEqual(nameFormatSnapshot.actionQueue[0].applicant, "Freeman, Kristin", "applicant name uses Last, First format");

assertEqual(inlineSnapshot.summary.totalActiveCandidates, 4, "active summary excludes inactive rows");
assertEqual(inlineSnapshot.summary.fullyVetted, 1, "fully vetted count is separate");
assertEqual(inlineSnapshot.summary.started, 1, "started count is separate");
assertEqual(inlineSnapshot.summary.statusCounts.length, 3, "active status count entries");
assertEqual(
  inlineSnapshot.summary.statusCounts.some((status) => status.name === "*5. Inactive"),
  false,
  "inactive statuses are excluded from summary status counts",
);

const badgeItem = inlineSnapshot.summary.completionItems.find((item) => item.name === "Badge");
assertEqual(Boolean(badgeItem), true, "completion aggregation includes Badge");
assertEqual(badgeItem.completed, 2, "completed item count");
assertEqual(badgeItem.incomplete, 1, "incomplete item count");

const w4Item = inlineSnapshot.summary.completionItems.find((item) => item.name === "W-4");
assertEqual(Boolean(w4Item), true, "completion aggregation includes W-4 item");
assertEqual(w4Item.completed, 1, "W-4 completed count");
assertEqual(w4Item.incomplete, 1, "W-4 incomplete count");

const completedBackgroundConsentItem = inlineSnapshot.summary.completionItems.find((item) => item.name === "Vendor B Background Check Consent");
const incompleteBackgroundConsentItem = inlineSnapshot.summary.completionItems.find((item) => item.name === "Vendor A Background Check Consent Form");
assertEqual(Boolean(completedBackgroundConsentItem), true, "completed background check consent keeps exact name");
assertEqual(Boolean(incompleteBackgroundConsentItem), true, "incomplete background check consent keeps exact name");
assertEqual(completedBackgroundConsentItem.completed, 1, "exact background consent completed count");
assertEqual(incompleteBackgroundConsentItem.incomplete, 1, "exact background consent incomplete count");

const workflowRows = Dashboard.applyDashboardFilters(inlineSnapshot, { offices: ["Office"] });
const workflowTiles = Dashboard.buildWorkflowCompletionItems(workflowRows, [
  { key: "completion-Badge", label: "Badge", names: ["Badge"] },
  { key: "completion-Personal Info", label: "Personal Info", names: ["Personal Info"] },
  { key: "completion-W-4", label: "W-4", names: ["W-4"] },
]);
const workflowBadge = workflowTiles.find((item) => item.key === "completion-Badge");
const workflowPersonalInfo = workflowTiles.find((item) => item.key === "completion-Personal Info");
const workflowW4 = workflowTiles.find((item) => item.key === "completion-W-4");
assertEqual(workflowBadge.completed, 1, "workflow completed count stops before later incomplete items");
assertEqual(workflowBadge.incomplete, 1, "workflow earliest incomplete first tile");
assertEqual(workflowPersonalInfo.incomplete, 2, "workflow second tile includes candidates not stopped earlier");
assertEqual(workflowW4.incomplete, 0, "workflow later incomplete excludes candidates stuck earlier");
assertEqual(
  Dashboard.candidateMatchesWorkflowCompletion(workflowRows.find((candidate) => candidate.applicant === "E"), workflowTiles, "completion-Personal Info", "incomplete"),
  true,
  "workflow click filter matches candidate stopped at selected item",
);

const onlineOnlyRows = Dashboard.applyDashboardFilters(inlineSnapshot, { status: "Fully Vetted" });
const onlineOnlySummary = Dashboard.buildFilteredSummary(onlineOnlyRows);
assertEqual(onlineOnlyRows.length, 1, "filtered row count for summary test");
assertEqual(onlineOnlySummary.totalActiveCandidates, 1, "filtered summary total follows filtered rows");
assertEqual(onlineOnlySummary.statusCounts.length, 1, "filtered summary status list follows filtered rows");
assertEqual(onlineOnlySummary.statusCounts[0].name, "Fully Vetted", "filtered summary status name");

const singleOfficeRows = Dashboard.applyDashboardFilters(inlineSnapshot, { offices: ["Office"] });
const multiOfficeRows = Dashboard.applyDashboardFilters(inlineSnapshot, { offices: ["Office", "Second Office"] });
assertEqual(singleOfficeRows.length, 3, "single office filter excludes other active offices");
assertEqual(multiOfficeRows.length, 4, "multi-office filter includes selected active offices");

let sampleResult = null;
if (fs.existsSync(reportPath)) {
  const csv = fs.readFileSync(reportPath, "utf8");
  const snapshot = Dashboard.createDashboardFromCsv(csv, {
    fileName: path.basename(reportPath),
    fallbackDate: new Date(2026, 4, 14),
  });

  assertEqual(snapshot.parsedRowCount, 2409, "row count");
  assertEqual(snapshot.parsedColumnCount, 43, "column count");

  const hasMultiItem = snapshot.actionQueue.some(
    (candidate) =>
      candidate.pendingTasks.some((item) => item.name === "Personal Info") &&
      candidate.pendingTasks.some((item) => /General Questionnaire/.test(item.name)),
  );
  assertEqual(hasMultiItem, true, "multi-item pending task parsing");

  const defaultRows = Dashboard.applyDashboardFilters(snapshot, {});
  const withInactiveRows = Dashboard.applyDashboardFilters(snapshot, { includeInactive: true });
  if (withInactiveRows.length <= defaultRows.length) {
    throw new Error("inactive toggle should add rows");
  }

  const defaultHasInactive = defaultRows.some((candidate) => candidate.isInactive);
  assertEqual(defaultHasInactive, false, "default queue excludes inactive statuses");

  sampleResult = {
    rows: snapshot.parsedRowCount,
    columns: snapshot.parsedColumnCount,
    activeCandidates: snapshot.summary.totalActiveCandidates,
    pendingCandidates: snapshot.summary.pending,
    staleCandidates: snapshot.summary.stale,
    missingOwner: snapshot.summary.missingOwner,
    statusCountEntries: snapshot.summary.statusCounts.length,
    completionItems: snapshot.summary.completionItems.length,
    defaultQueue: defaultRows.length,
    withInactiveQueue: withInactiveRows.length,
  };
}

console.log("Onboarding dashboard checks passed");
console.log(
  JSON.stringify(
    {
      inline: {
        activeCandidates: inlineSnapshot.summary.totalActiveCandidates,
        statusCountEntries: inlineSnapshot.summary.statusCounts.length,
        completionItems: inlineSnapshot.summary.completionItems.length,
      },
      sample: sampleResult || `Skipped missing sample file: ${reportPath}`,
    },
    null,
    2,
  ),
);
