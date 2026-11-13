// Gathers release context from Jira as the invoking user (asUser), so the app
// and its Rovo tools can only see what that person can already see in Jira.
import api, { route } from '@forge/api';
import { computeReadiness, type IssueFact, type ReleaseContext, type Readiness } from './readiness';

type JiraVersion = { id: string; name: string; releaseDate?: string; released: boolean; archived: boolean; description?: string };

const getJson = async <T>(res: Response | { ok: boolean; status: number; json: () => Promise<unknown> }, what: string): Promise<T> => {
  if (!res.ok) throw new Error(`${what} failed (HTTP ${res.status})`);
  return (await res.json()) as T;
};

export const listVersions = async (projectKey: string): Promise<JiraVersion[]> => {
  const res = await api.asUser().requestJira(route`/rest/api/3/project/${projectKey}/versions`);
  const all = await getJson<JiraVersion[]>(res, `Versions for ${projectKey}`);
  return all.filter((v) => !v.archived);
};

// Accepts a version id, an exact name, or a case-insensitive name.
export const findVersion = async (projectKey: string, version: string): Promise<JiraVersion> => {
  const versions = await listVersions(projectKey);
  const hit =
    versions.find((v) => v.id === version) ??
    versions.find((v) => v.name === version) ??
    versions.find((v) => v.name.toLowerCase() === version.trim().toLowerCase());
  if (!hit) throw new Error(`No version "${version}" in project ${projectKey}. Known: ${versions.map((v) => v.name).join(', ') || 'none'}`);
  return hit;
};

type SearchIssue = {
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { key: 'new' | 'indeterminate' | 'done' } };
    priority?: { name: string } | null;
    assignee?: { displayName: string } | null;
    updated: string;
    issuelinks?: {
      type: { outward: string; inward: string };
      outwardIssue?: { key: string; fields: { status: { statusCategory: { key: string } } } };
      inwardIssue?: { key: string; fields: { status: { statusCategory: { key: string } } } };
    }[];
  };
};

const search = async (jql: string, fields: string[]): Promise<SearchIssue[]> => {
  const out: SearchIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const res = await api.asUser().requestJira(route`/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields, maxResults: 100, ...(nextPageToken ? { nextPageToken } : {}) }),
    });
    const page = await getJson<{ issues: SearchIssue[]; nextPageToken?: string }>(res, 'Issue search');
    out.push(...page.issues);
    nextPageToken = page.nextPageToken;
  } while (nextPageToken && out.length < 500);
  return out;
};

const findReleaseNotes = async (v: JiraVersion): Promise<{ title: string; url: string } | null> => {
  // 1) Remote links on the version (how Jira links release notes pages).
  try {
    const res = await api.asUser().requestJira(route`/rest/api/3/version/${v.id}/remotelinks`);
    if (res.ok) {
      const links = (await res.json()) as { link?: { object?: { url?: string; title?: string } } | string }[];
      for (const l of links) {
        const obj = typeof l.link === 'string' ? JSON.parse(l.link) : l.link;
        const url: string | undefined = obj?.object?.url ?? obj?.url;
        if (url && /\/wiki\//.test(url)) return { title: obj?.object?.title ?? obj?.title ?? 'Confluence page', url };
      }
    }
  } catch {
    /* fall through to description */
  }
  // 2) A Confluence URL in the version description.
  const m = v.description?.match(/https:\/\/[^\s]+\/wiki\/[^\s)]+/);
  return m ? { title: 'Linked in version description', url: m[0] } : null;
};

const today = () => new Date().toISOString().slice(0, 10);

export const gatherContext = async (projectKey: string, version: string): Promise<ReleaseContext> => {
  const v = await findVersion(projectKey, version);
  const base = `project = "${projectKey}" AND fixVersion = ${v.id}`;
  const [issues, flagged, reopened, notes] = await Promise.all([
    search(base, ['summary', 'status', 'priority', 'assignee', 'updated', 'issuelinks']),
    search(`${base} AND Flagged is not EMPTY`, ['summary']).catch(() => [] as SearchIssue[]),
    // An issue whose resolution was cleared in the last 14 days was reopened.
    search(`${base} AND resolution CHANGED AFTER -14d AND resolution is EMPTY`, ['summary']).catch(() => [] as SearchIssue[]),
    findReleaseNotes(v),
  ]);
  const flaggedKeys = new Set(flagged.map((i) => i.key));
  const reopenedKeys = new Set(reopened.map((i) => i.key));
  const facts: IssueFact[] = issues.map((i) => {
    const links = i.fields.issuelinks ?? [];
    return {
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status.name,
      statusCategory: i.fields.status.statusCategory.key,
      priority: i.fields.priority?.name ?? null,
      assignee: i.fields.assignee?.displayName ?? null,
      flagged: flaggedKeys.has(i.key),
      blocksOpenIssue: links.some((l) => /blocks/i.test(l.type.outward) && l.outwardIssue && l.outwardIssue.fields.status.statusCategory.key !== 'done'),
      isBlockedBy: links
        .filter((l) => /blocked by/i.test(l.type.inward) && l.inwardIssue && l.inwardIssue.fields.status.statusCategory.key !== 'done')
        .map((l) => l.inwardIssue!.key),
      reopened: reopenedKeys.has(i.key),
      updated: i.fields.updated,
    };
  });
  return { versionId: v.id, versionName: v.name, releaseDate: v.releaseDate ?? null, released: v.released, issues: facts, releaseNotes: notes, today: today() };
};

export const readinessFor = async (projectKey: string, version: string): Promise<{ ctx: ReleaseContext; readiness: Readiness }> => {
  const ctx = await gatherContext(projectKey, version);
  return { ctx, readiness: computeReadiness(ctx) };
};
