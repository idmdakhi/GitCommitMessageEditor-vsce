# Changelog

All notable changes to the **Git Commit Message Editor (Gitcme)** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-08-27

### Added

#### Core Editor

- **Structured commit message form** with live preview and full support for Conventional Commits
- **Two‑pane workspace** – form on the left, live preview on the right
- **Type field** – grid selection with emoji support (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, wip)
- **Scope field** – with saved scope chips and **➕ Save** button
- **Subject field** – live validation (length, trailing period, capitalisation, imperative mood)
- **Body field** – multiline textarea with line‑length warnings
- **Gitmoji support** – emojis for commit types with **Auto Gitmoji** toggle
- **Issue reference fields** – Closes, Resolves, Refs, See also (auto‑adds `#` to issue numbers)
- **Trailer fields** – Signed-off-by, Co-authored-by, Reviewed-by, Tested-by, Acked-by, Reported-by
- **BREAKING CHANGE** – conditional multiline field

#### Preview & Validation

- **Live preview** – real‑time commit message preview with line numbers
- **Sticky dashboard** – status chips showing filled/required/optional fields
- **Progress counter** – `X of N sections` filled
- **Validation warnings** – clickable warnings for:
  - Subject length exceeding `maxSubjectLength`
  - Subject ending with a period
  - Subject starting with a capital letter
  - Past‑tense verbs instead of imperative mood
  - Long lines in body exceeding `maxLineLength`

#### Toolbar & Actions

- **Insert** – write message into Source Control input box
- **Copy** – copy message to clipboard
- **Reset** – clear all form fields
- **⚡ Suggestions** – auto‑fill empty fields:
  - Scope – guessed from staged files
  - Resolves – extracted from branch name
  - Signed‑off‑by – from `git config` (if `autoFillSignedOffBy` is enabled)
- **✨ AI Draft** – generate commit message from staged changes using GitHub Copilot Chat (requires Copilot Chat)
- **⚙ Template** – open graphical Config Editor
- **📌 Git Template** – write `.gitmessage` and set `git config commit.template`
- **🔄 Amend Last** – load last commit’s message into the form and amend it
- **↩️ Undo Insert** – restore previous Source Control input box value
- **📁 Repo Config** – create starter `.commit-message-editor.json` file

#### Templates

- **Built‑in templates**:
  - Conventional Commits (full‑featured default)
  - Gitmoji (minimal – emoji + subject + body)
  - Angular (scope required)
  - Text (just subject and body)
- **Workspace templates** – saved in `.vscode/commit-templates/` (repo‑specific, editable, shareable)
- **Config Editor** – graphical tool to:
  - Switch active template
  - Activate template
  - Duplicate templates
  - Delete workspace templates (built‑ins are read‑only)
  - Edit JSON directly
  - Save changes
  - Export/Import JSON

#### Git Integration

- **Multi‑repository support** – switch between open repositories from the repo info bar
- **Auto‑suggestions**:
  - Scope from staged files
  - Issue number from branch name
  - Signed‑off‑by from `git config`
- **Recent commits** – click to load subject/body into the form (auto‑parses type, scope, Gitmoji, trailers)
- **Amend last commit** – with modal confirmation
- **Undo last insert** – revert Source Control input box
- **Register Git template** – creates `.gitmessage` and sets `commit.template`

#### Configuration

- **Extension settings** (all under `gitCommitMessageEditor`):
  - `types` – allowed type list
  - `scopes` – saved scopes
  - `autoFillSignedOffBy` – auto‑fill from `git config`
  - `autoGitmoji` – auto‑select Gitmoji matching Type
  - `detectIssueFromBranch` – detect issue numbers from branch names
  - `maxSubjectLength` – default `72`
  - `maxLineLength` – default `100`
  - `rememberFrequentValues` – show frequent values as chips
  - `showRecentCommits` – show recent commits
  - `recentCommitsMaxItems` – default `12`
  - `emojiPrefix` – prefix message with Gitmoji
  - `keepAfterSave` – keep editor tab open after Insert
- **Repo config file** – `.commit-message-editor.json` / `.yaml` / `.yml` in repository root:
  - Override `types`, `scopes`, `maxSubjectLength`, `maxLineLength`
  - Override `autoFillSignedOffBy`, `detectIssueFromBranch`, `emojiPrefix`
  - Full custom `template` with `tokens` and `template` structure

#### UI/UX

- **Modern, responsive design** – adapts to VS Code theme (light/dark)
- **Sticky status dashboard** – always visible at the top
- **Chips** – clickable status indicators for each field
- **Collapsible sections** – Recent commits and optional fields
- **“More” dropdown** – groups advanced actions
- **Spinner feedback** – for loading operations (Suggestions, AI Draft)
- **Accessibility** – keyboard navigation, focus management, ARIA labels
- **Reduced motion** – respects `prefers-reduced-motion`

#### Developer Experience

- **TypeScript** – fully typed source code
- **esbuild** – fast bundling
- **JSON Schema** – `v1-template.schema.json` for template validation
- **Official VS Code Git Extension API** – no external Git dependencies
- **VS Code `vscode.lm` API** – for AI Draft (Copilot Chat)

---

## [Unreleased]

### Added

- _(Future features – see [docs/TODO.md](docs/TODO.md))_

- **Full i18n support** – Persian (fa) and English (en) translations for all UI strings (extension and webview)
- Language detection follows VS Code display language; users can manually override via `gitCommitMessageEditor.language` setting

---

## Legend

- `Added` – new features
- `Changed` – changes to existing functionality
- `Deprecated` – soon‑to‑be removed features
- `Removed` – now removed features
- `Fixed` – bug fixes
- `Security` – vulnerability fixes

---

[1.0.0]: https://github.com/idmdakhi/GitCommitMessageEditor-vsce/releases/tag/v1.0.0
