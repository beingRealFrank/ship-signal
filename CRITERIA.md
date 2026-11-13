# Judging criteria → features

| Criterion | How Ship Signal meets it |
|---|---|
| Technological Implementation | Forge app with a UI Kit `jira:projectPage` and a `rovo:mcp` module exposing three `action` tools. Uses the Jira search (`/rest/api/3/search/jql` with pagination), project versions, version remote links, issue links and JQL history (`resolution CHANGED AFTER -14d`). Everything runs `asUser()` with a single read scope. Scoring is pure and unit-tested. Deploys as "Runs on Atlassian" eligible. |
| Design | One question, one number, one verdict. Every deduction is a table row with its reason and linked issues, so nothing is a black box. Native UI Kit components (Lozenge, ProgressBar, DynamicTable, SectionMessage, EmptyState) keep it consistent with Jira. |
| Potential Impact | Release go/no-go is a recurring, high-stakes meeting in most software teams. Ship Signal turns it into a glance on the page and a question to Rovo, and catches the problems that slip through: unowned work, reopened bugs, missing release notes. |
| Quality of the Idea | It uses connected context (issues, links, flags, history and Confluence release notes) to answer a question teams actually ask, and it shows its working so teams can trust the answer and act on it. The same logic serves people (the page) and agents (the MCP tools). |
