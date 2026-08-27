# Git Commit Message Editor

Modern VS Code commit message editor with a configurable form, optional AI draft, and repo-level shared templates.

## Development

```bash
npm install
npm run compile
```

Then open this folder in VS Code and press `F5` to launch an Extension Development Host. Open a Git repo, go to **Source Control**, and click the edit icon, or run **Git Commit Message Editor: Open Editor** from the Command Palette.

## Features

- Conventional Commits form (type, scope, subject, body, BREAKING CHANGE, issue refs, trailers)
- Live preview; insert into Source Control; copy; reset
- Optional sections: enable a checkbox to reveal and fill each optional field
- Sticky status dashboard with progress chips and validation warnings
- Auto-suggestions (scope from staged files, Signed-off-by, issue from branch name)
- Recent commits quick-fill; amend last commit; undo last insert
- AI draft via `vscode.lm` (requires GitHub Copilot Chat)
- Graphical template config editor + Import/Export JSON
- Built-in presets: Conventional Commits, Gitmoji, Angular, Simple
- Repo-level `.commit-message-editor.json` / `.yaml` shared with the team
- Register message as Git `commit.template` (`.gitmessage`)

## Repo config file

Place `.commit-message-editor.json` at the repository root. Example:

```json
{
  "name": "Backend team convention",
  "types": ["feat", "fix", "chore"],
  "scopes": ["api", "auth", "db"],
  "maxSubjectLength": 60,
  "autoFillSignedOffBy": true,
  "detectIssueFromBranch": true
}
```

Or include a full custom `template` with `tokens` and `template` (see schema under `schemas/`).

## Package

```bash
npm run package
code --install-extension GitCommitMessageEditor-vsce-*.vsix
```
