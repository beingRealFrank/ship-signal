# Ship Signal

**Is this release ready to ship?** Ship Signal answers that for any Jira fix version, using the
context your team already has in Jira and Confluence, and it shows its working.

It is a Forge app with two surfaces:

1. **A Jira project page** (UI Kit). It lists the project's unreleased versions, scores the selected one from
   0 to 100, gives a verdict (*Ready*, *At risk* or *Not ready*), and shows a table of every check with the
   points it cost and the issues behind it, each linked.
2. **Rovo MCP tools** (`rovo:mcp` module). The same checks are exposed as tools, so a Rovo agent (or any
   MCP-compatible client the site admin connects) can answer "Is 2.4 ready to ship?" or "What's blocking 2.4?".

## How readiness is scored

The score starts at 100. Each check removes points, and each one has a cap so a single problem can't hide
the others. Every deduction is shown with its reason.

| Check | Deduction |
|---|---|
| Open high-priority issues (Highest, High, Blocker, Critical) | -10 each, max -30 |
| Flagged issues, issues blocking open work, or issues blocked by unresolved issues | -8 each, max -25 |
| Open issues with no assignee | -3 each, max -15 |
| Issues reopened in the last 14 days (resolution cleared) | -5 each, max -10 |
| No Confluence release-notes page linked to the version | -10 |
| Schedule risk: past the release date with work open, or ≤7 days left with >25% open | -10 |

**Verdict:** *Ready* at 85+ with no open high-priority issues, *At risk* at 60+, otherwise *Not ready*.

The release-notes check looks for a Confluence (`/wiki/`) link in the version's remote links, then in the version
description.

## Rovo MCP tools

| Tool | Inputs | Returns |
|---|---|---|
| `get-release-readiness` | `projectKey`, `version` (name or id) | Score, verdict and every check as text |
| `list-release-blockers` | `projectKey`, `version` | Each blocking issue with assignee and reason |
| `list-upcoming-releases` | `projectKey` | Each unreleased version with verdict, score and open count |

Example prompts for a Rovo agent that has these tools:

- "Is SHIP version 2.4.0 ready to ship?"
- "What's blocking the 2.4.0 release in SHIP, and who owns each blocker?"
- "Which upcoming SHIP releases are at risk?"

All Jira calls run **as the invoking user** (`asUser()`), so the page and the tools only see what that person can
already see. The only scope is `read:jira-work`. The app never writes to Jira.

## Install

```bash
npm install
npm test            # scoring unit tests
npm run typecheck
forge deploy -e development
forge install --site <your-site>.atlassian.net --product jira -e development
```

Then open a Jira project and choose **Ship Signal** in the project sidebar. To use the tools, create a custom
agent in Rovo Studio, add the *Ship Signal* tools from **Connected apps**, and publish it.

## Code

- `src/core/readiness.ts`: pure scoring logic, unit-tested in `src/core/readiness.test.ts`
- `src/core/jira.ts`: gathers versions, issues, links, flags, reopen history and release-notes links
- `src/resolvers.ts`: backend for the project page
- `src/mcp.ts`: the Rovo MCP tool handlers
- `src/frontend/index.tsx`: the UI Kit project page

## AI disclosure

The code, documentation and video for this project were produced by Claude Code AI agents. The entrant, Frank
Gilroy, chose and edited the concept, approved the scope and reviewed the submission. See [AI_USE.md](AI_USE.md).

## License

MIT. See [LICENSE](LICENSE).
