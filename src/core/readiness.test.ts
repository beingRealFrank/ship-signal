import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReadiness, readinessText, blockersOf, type IssueFact, type ReleaseContext } from './readiness.ts';

const issue = (key: string, o: Partial<IssueFact> = {}): IssueFact => ({
  key, summary: `Issue ${key}`, status: 'Done', statusCategory: 'done', priority: 'Medium', assignee: 'Ana',
  flagged: false, blocksOpenIssue: false, isBlockedBy: [], reopened: false, updated: '2026-11-10', ...o,
});
const ctx = (issues: IssueFact[], o: Partial<ReleaseContext> = {}): ReleaseContext => ({
  versionId: '1', versionName: 'v2.4', releaseDate: '2026-12-01', released: false, issues,
  releaseNotes: { title: 'v2.4 release notes', url: 'https://x.atlassian.net/wiki/x' }, today: '2026-11-13', ...o,
});

test('a clean release is Ready at 100', () => {
  const r = computeReadiness(ctx([issue('A-1'), issue('A-2')]));
  assert.equal(r.score, 100);
  assert.equal(r.verdict, 'Ready');
  assert.ok(r.checks.every((c) => c.passed));
});

test('each deduction is explained and capped', () => {
  const open = (k: string, o: Partial<IssueFact> = {}) => issue(k, { statusCategory: 'indeterminate', status: 'In Progress', ...o });
  const r = computeReadiness(ctx([
    open('A-1', { priority: 'Highest' }), open('A-2', { priority: 'High' }), open('A-3', { priority: 'High' }), open('A-4', { priority: 'High' }),
    open('A-5', { flagged: true, assignee: null }),
  ], { releaseNotes: null }));
  const hp = r.checks.find((c) => c.id === 'high-priority-open')!;
  assert.equal(hp.deduction, 30); // capped
  assert.deepEqual(hp.issues, ['A-1', 'A-2', 'A-3', 'A-4']);
  assert.equal(r.checks.find((c) => c.id === 'blockers')!.deduction, 8);
  assert.equal(r.checks.find((c) => c.id === 'unassigned')!.deduction, 3);
  assert.equal(r.checks.find((c) => c.id === 'release-notes')!.deduction, 10);
  assert.equal(r.score, 100 - 30 - 8 - 3 - 10);
  assert.equal(r.verdict, 'Not ready'); // 49 < 60
});

test('high-priority work open blocks a Ready verdict even with a high score', () => {
  const r = computeReadiness(ctx([issue('A-1', { statusCategory: 'new', priority: 'High' }), ...Array.from({ length: 20 }, (_, i) => issue(`B-${i}`))]));
  assert.equal(r.score, 90);
  assert.equal(r.verdict, 'At risk');
});

test('schedule: past due with open work deducts', () => {
  const r = computeReadiness(ctx([issue('A-1', { statusCategory: 'new' })], { releaseDate: '2026-11-01' }));
  const s = r.checks.find((c) => c.id === 'schedule')!;
  assert.equal(s.deduction, 10);
  assert.match(s.detail, /passed 12 day/);
  assert.equal(r.daysToRelease, -12);
});

test('schedule: close date with much open work deducts', () => {
  const issues = [issue('A-1', { statusCategory: 'new' }), issue('A-2', { statusCategory: 'new' }), issue('A-3')];
  const r = computeReadiness(ctx(issues, { releaseDate: '2026-11-18' }));
  assert.equal(r.checks.find((c) => c.id === 'schedule')!.deduction, 10);
});

test('reopened issues deduct even if done again', () => {
  const r = computeReadiness(ctx([issue('A-1', { reopened: true }), issue('A-2', { reopened: true }), issue('A-3', { reopened: true })]));
  assert.equal(r.checks.find((c) => c.id === 'reopened')!.deduction, 10);
});

test('many failures bottom out at Not ready, never below 0', () => {
  const bad = Array.from({ length: 10 }, (_, i) => issue(`C-${i}`, { statusCategory: 'new', priority: 'Highest', flagged: true, assignee: null, reopened: true }));
  const r = computeReadiness(ctx(bad, { releaseNotes: null, releaseDate: '2026-11-01' }));
  assert.equal(r.score, 0);
  assert.equal(r.verdict, 'Not ready');
});

test('text rendering lists every check and blockers helper filters', () => {
  const c = ctx([issue('A-1', { statusCategory: 'new', isBlockedBy: ['A-9'] }), issue('A-2')]);
  const t = readinessText(computeReadiness(c));
  assert.match(t, /^Release v2\.4: /);
  assert.equal(t.split('\n').length, 7);
  assert.deepEqual(blockersOf(c).map((i) => i.key), ['A-1']);
});
