// Ship Signal project page (UI Kit). Shows each unreleased version's readiness,
// with every deduction explained and the issues behind it one click away.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box, DynamicTable, EmptyState, Heading, Inline, Link, Lozenge, ProgressBar, SectionMessage, Select, Spinner, Stack, Strong, Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

type Version = { id: string; name: string; releaseDate: string | null };
type Check = { id: string; label: string; passed: boolean; deduction: number; detail: string; issues: string[] };
type Readiness = {
  versionName: string; score: number; verdict: 'Ready' | 'At risk' | 'Not ready'; checks: Check[];
  totals: { issues: number; done: number; open: number }; daysToRelease: number | null;
};
type Result = { readiness: Readiness; byKey: Record<string, { summary: string; status: string }>; releaseNotes: { title: string; url: string } | null };

// invoke() is typed as a union with a metadata wrapper; our resolvers return plain values.
const call = <T,>(fn: string, payload?: Record<string, unknown>) => invoke(fn, payload) as unknown as Promise<T>;

const appearance = (v: Readiness['verdict']) => (v === 'Ready' ? 'success' : v === 'At risk' ? 'moved' : 'removed');

const App = () => {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    call<Version[]>('listVersions')
      .then((v) => {
        setVersions(v);
        if (v.length) setSelected(v[0]!.id);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    call<Result>('getReadiness', { versionId: selected })
      .then(setResult)
      .catch((e) => setError(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [selected]);

  if (error) return <SectionMessage appearance="error" title="Ship Signal couldn't load"><Text>{error}</Text></SectionMessage>;
  if (!versions) return <Spinner label="Loading releases" />;
  if (!versions.length)
    return <EmptyState header="No unreleased versions" description="Create a fix version in this project and Ship Signal will score its readiness." />;

  const r = result?.readiness;
  const rows = (r?.checks ?? []).map((c) => ({
    key: c.id,
    cells: [
      { key: 'state', content: <Lozenge appearance={c.passed ? 'success' : 'removed'}>{c.passed ? 'Pass' : `-${c.deduction}`}</Lozenge> },
      { key: 'label', content: <Text><Strong>{c.label}</Strong></Text> },
      { key: 'detail', content: <Text>{c.detail}</Text> },
      {
        key: 'issues',
        content: (
          <Inline space="space.050" shouldWrap>
            {c.issues.slice(0, 8).map((k) => (
              <Link key={k} href={`/browse/${k}`}>{k}</Link>
            ))}
            {c.issues.length > 8 ? <Text>+{c.issues.length - 8} more</Text> : null}
          </Inline>
        ),
      },
    ],
  }));

  return (
    <Stack space="space.200">
      <Inline space="space.200" alignBlock="center" spread="space-between">
        <Heading size="medium">Is this release ready to ship?</Heading>
        <Box xcss={{ width: '280px' }}>
          <Select
            inputId="version"
            options={versions.map((v) => ({ label: `${v.name}${v.releaseDate ? ` · due ${v.releaseDate}` : ''}`, value: v.id }))}
            value={versions.filter((v) => v.id === selected).map((v) => ({ label: `${v.name}${v.releaseDate ? ` · due ${v.releaseDate}` : ''}`, value: v.id }))[0]}
            onChange={(o: { value: string }) => setSelected(o.value)}
          />
        </Box>
      </Inline>

      {loading || !r ? (
        <Spinner label="Reading issues, links and release notes" />
      ) : (
        <Stack space="space.200">
          <Inline space="space.200" alignBlock="center">
            <Heading size="xlarge">{`${r.score}`}</Heading>
            <Stack space="space.050">
              <Lozenge appearance={appearance(r.verdict)} isBold>{r.verdict}</Lozenge>
              <Text>{`${r.totals.done} of ${r.totals.issues} issues done${r.daysToRelease !== null ? ` · ${r.daysToRelease >= 0 ? `${r.daysToRelease} days to release` : `${-r.daysToRelease} days overdue`}` : ''}`}</Text>
            </Stack>
          </Inline>
          <ProgressBar value={r.score / 100} appearance={r.verdict === 'Ready' ? 'success' : 'default'} ariaLabel="Readiness score" />
          {result?.releaseNotes ? (
            <Text>Release notes: <Link href={result.releaseNotes.url} openNewTab>{result.releaseNotes.title}</Link></Text>
          ) : (
            <SectionMessage appearance="warning" title="No release notes linked">
              <Text>Link a Confluence page to this version (Releases, then the version, then Add link) so the team ships with notes.</Text>
            </SectionMessage>
          )}
          <DynamicTable
            caption="How the score was worked out"
            head={{ cells: [{ key: 'state', content: 'Result' }, { key: 'label', content: 'Check' }, { key: 'detail', content: 'Why' }, { key: 'issues', content: 'Issues' }] }}
            rows={rows}
          />
          <Text>Ask Rovo: "Is {r.versionName} ready to ship?" Ship Signal's tools answer from the same checks.</Text>
        </Stack>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
