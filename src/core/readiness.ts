// Ship Signal readiness scoring. Pure functions: no Forge or network imports,
// so the same logic runs in the Jira page, the Rovo MCP tools, and unit tests.

export type IssueFact = {
  key: string;
  summary: string;
  status: string;
  statusCategory: 'new' | 'indeterminate' | 'done';
  priority: string | null;
  assignee: string | null;
  flagged: boolean;
  blocksOpenIssue: boolean; // has an outward "blocks" link to an issue that is not done
  isBlockedBy: string[]; // keys of unresolved issues blocking this one
  reopened: boolean; // moved from done back to not-done within the lookback window
  updated: string;
};

export type ReleaseContext = {
  versionId: string;
  versionName: string;
  releaseDate: string | null; // YYYY-MM-DD
  released: boolean;
  issues: IssueFact[];
  releaseNotes: { title: string; url: string } | null; // linked Confluence page
  today: string; // YYYY-MM-DD (injected for testability)
};

export type Check = {
  id: string;
  label: string;
  passed: boolean;
  deduction: number; // points removed from 100
  detail: string;
  issues: string[];
};

export type Readiness = {
  versionName: string;
  score: number; // 0..100
  verdict: 'Ready' | 'At risk' | 'Not ready';
  checks: Check[];
  totals: { issues: number; done: number; open: number };
  daysToRelease: number | null;
};

const HIGH = new Set(['highest', 'high', 'blocker', 'critical']);
const isOpen = (i: IssueFact) => i.statusCategory !== 'done';

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// Each rule caps its own deduction so one bad signal can't hide the others.
export const computeReadiness = (ctx: ReleaseContext): Readiness => {
  const open = ctx.issues.filter(isOpen);
  const done = ctx.issues.length - open.length;
  const checks: Check[] = [];
  const add = (c: Omit<Check, 'passed'>) => checks.push({ ...c, passed: c.deduction === 0 });

  const highOpen = open.filter((i) => i.priority && HIGH.has(i.priority.toLowerCase()));
  add({
    id: 'high-priority-open',
    label: 'No open high-priority issues',
    deduction: Math.min(30, highOpen.length * 10),
    detail: highOpen.length ? `${highOpen.length} open high-priority issue(s), -10 each (max -30)` : 'None open',
    issues: highOpen.map((i) => i.key),
  });

  const blockers = open.filter((i) => i.flagged || i.blocksOpenIssue || i.isBlockedBy.length > 0);
  add({
    id: 'blockers',
    label: 'No flagged or blocked work',
    deduction: Math.min(25, blockers.length * 8),
    detail: blockers.length ? `${blockers.length} flagged/blocking/blocked issue(s), -8 each (max -25)` : 'Nothing flagged or blocked',
    issues: blockers.map((i) => i.key),
  });

  const unassigned = open.filter((i) => !i.assignee);
  add({
    id: 'unassigned',
    label: 'Every open issue has an owner',
    deduction: Math.min(15, unassigned.length * 3),
    detail: unassigned.length ? `${unassigned.length} open issue(s) without an assignee, -3 each (max -15)` : 'All open issues assigned',
    issues: unassigned.map((i) => i.key),
  });

  const reopened = ctx.issues.filter((i) => i.reopened);
  add({
    id: 'reopened',
    label: 'No recently reopened issues',
    deduction: Math.min(10, reopened.length * 5),
    detail: reopened.length ? `${reopened.length} issue(s) reopened in the last 14 days, -5 each (max -10)` : 'Nothing reopened recently',
    issues: reopened.map((i) => i.key),
  });

  add({
    id: 'release-notes',
    label: 'Release notes page linked in Confluence',
    deduction: ctx.releaseNotes ? 0 : 10,
    detail: ctx.releaseNotes ? `Linked: ${ctx.releaseNotes.title}` : 'No Confluence release notes linked to this version, -10',
    issues: [],
  });

  const daysToRelease = ctx.releaseDate ? daysBetween(ctx.today, ctx.releaseDate) : null;
  const ratioOpen = ctx.issues.length ? open.length / ctx.issues.length : 0;
  let scheduleDeduction = 0;
  let scheduleDetail = 'No release date set';
  if (daysToRelease !== null) {
    if (daysToRelease < 0 && open.length) {
      scheduleDeduction = 10;
      scheduleDetail = `Release date passed ${-daysToRelease} day(s) ago with ${open.length} open issue(s), -10`;
    } else if (daysToRelease <= 7 && ratioOpen > 0.25) {
      scheduleDeduction = 10;
      scheduleDetail = `${daysToRelease} day(s) left and ${Math.round(ratioOpen * 100)}% of issues still open, -10`;
    } else scheduleDetail = `${daysToRelease} day(s) to release, ${Math.round(ratioOpen * 100)}% open`;
  }
  add({ id: 'schedule', label: 'Remaining work fits the release date', deduction: scheduleDeduction, detail: scheduleDetail, issues: [] });

  const score = Math.max(0, 100 - checks.reduce((a, c) => a + c.deduction, 0));
  const verdict = score >= 85 && highOpen.length === 0 ? 'Ready' : score >= 60 ? 'At risk' : 'Not ready';
  return { versionName: ctx.versionName, score, verdict, checks, totals: { issues: ctx.issues.length, done, open: open.length }, daysToRelease };
};

// Plain-text rendering for Rovo agents and MCP clients.
export const readinessText = (r: Readiness): string => {
  const lines = [
    `Release ${r.versionName}: ${r.verdict} (${r.score}/100). ${r.totals.done}/${r.totals.issues} issues done.`,
    ...r.checks.map((c) => `${c.passed ? 'PASS' : 'FAIL'} ${c.label}: ${c.detail}${c.issues.length ? ` [${c.issues.slice(0, 10).join(', ')}]` : ''}`),
  ];
  return lines.join('\n');
};

export const blockersOf = (ctx: ReleaseContext): IssueFact[] =>
  ctx.issues.filter((i) => isOpen(i) && (i.flagged || i.blocksOpenIssue || i.isBlockedBy.length > 0 || (i.priority !== null && HIGH.has(i.priority.toLowerCase()))));
