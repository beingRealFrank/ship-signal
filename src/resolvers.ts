// Backend for the Jira project page (UI Kit). Every Jira call runs asUser.
import Resolver from '@forge/resolver';
import { listVersions, readinessFor } from './core/jira';

const resolver = new Resolver();

resolver.define('listVersions', async ({ context }) => {
  const projectKey: string = context.extension.project.key;
  const versions = await listVersions(projectKey);
  return versions
    .filter((v) => !v.released)
    .sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'))
    .map((v) => ({ id: v.id, name: v.name, releaseDate: v.releaseDate ?? null }));
});

resolver.define('getReadiness', async ({ payload, context }) => {
  const projectKey: string = context.extension.project.key;
  const { readiness, ctx } = await readinessFor(projectKey, String(payload.versionId));
  const byKey = Object.fromEntries(ctx.issues.map((i) => [i.key, { summary: i.summary, status: i.status }]));
  return { readiness, byKey, releaseNotes: ctx.releaseNotes };
});

export const handler = resolver.getDefinitions();
