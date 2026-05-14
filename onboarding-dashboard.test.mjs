import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Dashboard = require("./dashboard-core.js");

const reportPath =
  process.argv[2] ||
  "C:/Users/sheld/Downloads/Onboarding-Compliance-Report_20260514_1120AM.csv";
const csv = fs.readFileSync(reportPath, "utf8");
const snapshot = Dashboard.createDashboardFromCsv(csv, {
  fileName: path.basename(reportPath),
  fallbackDate: new Date(2026, 4, 14),
});

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

assertEqual(snapshot.parsedRowCount, 2409, "row count");
assertEqual(snapshot.parsedColumnCount, 43, "column count");
assertEqual(snapshot.summary.withPendingItems, 1598, "rows with pending items");
assertEqual(snapshot.summary.pendingAndStale, 793, "pending and stale rows");
assertEqual(snapshot.summary.missingOwner, 1017, "missing representative rows");

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

console.log("Onboarding dashboard checks passed");
console.log(
  JSON.stringify(
    {
      rows: snapshot.parsedRowCount,
      columns: snapshot.parsedColumnCount,
      pendingItems: snapshot.summary.withPendingItems,
      pendingAndStale: snapshot.summary.pendingAndStale,
      missingOwner: snapshot.summary.missingOwner,
      defaultQueue: defaultRows.length,
      withInactiveQueue: withInactiveRows.length,
    },
    null,
    2,
  ),
);
