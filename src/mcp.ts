// Rovo MCP tools. Each action returns plain text that an agent can relay.
import { listVersions, readinessFor } from './core/jira';
import { blockersOf, readinessText } from './core/readiness';

type Payload = { projectKey?: string; version?: string };

const need = (p: Payload, keys: (keyof Payload)[]) => {
  const missing = keys.filter((k) => !p[k] || !String(p[k]).trim());
  if (missing.length) throw new Error(`Missing input: ${missing.join(', ')}`);
};

const safe = async (fn: () => Promise<string>) => {
  try {
    return await fn();
  } catch (e) {
    return `Ship Signal could not answer: ${e instanceof Error ? e.message : String(e)}`;
  }
};

export const getReleaseReadiness = (payload: Payload) =>
  safe(async () => {
    need(payload, ['projectKey', 'version']);
    const { readiness } = await readinessFor(payload.projectKey!.trim().toUpperCase(), payload.version!);
    return readinessText(readiness);
  });

export const listReleaseBlockers = (payload: Payload) =>
  safe(async () => {
    need(payload, ['projectKey', 'version']);
    const { ctx } = await readinessFor(payload.projectKey!.trim().toUpperCase(), payload.version!);
    const b = blockersOf(ctx);
    if (!b.length) return `No blockers for ${ctx.versionName}: nothing open is high priority, flagged, blocking or blocked.`;
    return [
      `${b.length} blocker(s) for ${ctx.versionName}:`,
      ...b.map((i) => {
        const why = [
          i.priority && /highest|high|blocker|critical/i.test(i.priority) ? `${i.priority} priority` : '',
          i.flagged ? 'flagged' : '',
          i.blocksOpenIssue ? 'blocks open work' : '',
          i.isBlockedBy.length ? `blocked by ${i.isBlockedBy.join(', ')}` : '',
        ].filter(Boolean);
        return `- ${i.key} "${i.summary}" (${i.status}, ${i.assignee ?? 'unassigned'}): ${why.join('; ')}`;
      }),
    ].join('\n');
  });

export const listUpcomingReleases = (payload: Payload) =>
  safe(async () => {
    need(payload, ['projectKey']);
    const key = payload.projectKey!.trim().toUpperCase();
    const versions = (await listVersions(key)).filter((v) => !v.released);
    if (!versions.length) return `Project ${key} has no unreleased versions.`;
    const rows = await Promise.all(
      versions.slice(0, 8).map(async (v) => {
        const { readiness } = await readinessFor(key, v.id);
        return `- ${v.name}${v.releaseDate ? ` (due ${v.releaseDate})` : ''}: ${readiness.verdict}, ${readiness.score}/100, ${readiness.totals.open} open`;
      })
    );
    return [`Unreleased versions in ${key}:`, ...rows].join('\n');
  });
