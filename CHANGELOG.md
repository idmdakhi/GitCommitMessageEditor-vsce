# Changelog

All notable changes to the **Git Commit Message Editor (Gitcme)** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - 2026-09-03

### Added

#### Core Editor

- **Free‑form Text mode** – toggle between structured form and free‑text writing with a large textarea
- **Git Editor Mode** – edit `COMMIT_EDITMSG` directly in a full VS Code editor with 50/72 rulers and auto‑apply
- **Advanced Issue/PR references** – full support for GitHub autolinked references:
  - `#123`, `GH-123`, `owner/repo#123`, `org/repo#123`
  - Multiple keywords per field: `Resolves #10, resolves #123, resolves octo-org/octo-repo#100`
  - Supported keywords: `close`, `closes`, `closed`, `fix`, `fixes`, `fixed`, `resolve`, `resolves`, `resolved`
- **Internationalization (i18n)** – UI now supports English and Persian (فارسی) with automatic language detection

#### Toolbar & Actions

- **Mode tabs** – switch between Form and Free Text modes with a single click
- **Format Body** – auto‑wrap body lines based on `maxLineLength`, preserving paragraphs
- **Git Editor commands**:
  - `Open as Git Editor (COMMIT_EDITMSG)`
  - `Apply Git Editor Message`
  - `Close Git Editor`

#### Configuration

- `autoApplyGitEditor` – automatically apply message to SCM on Git Editor save (default: `true`)
- `defaultEditorMode` – default editor mode (`"form"` or `"freeform"`)
- `scmTitleCommand` – choose which command appears in the SCM title bar (`"open"` or `"openAsGitEditor"`)
- `rememberFrequentTypes` – show frequent Type values as clickable chips (default: `true`)
- `rememberFrequentScopes` – show frequent Scope values as clickable chips (default: `true`)
- `language` – UI language selection (`"auto"`, `"en"`, `"fa"`)

#### Git Integration

- **Frequent values** – Type and Scope values are extracted from the last 50 commits and shown as clickable chips
- **Virtual FileSystem Provider** – Git Editor mode now uses a proper `FileSystemProvider`, making the document editable and savable (no read‑only issues)

### Changed

- **Issue field processing** – completely rewritten to support multiple keywords and GitHub's autolinked reference format
- **Draft persistence** – now saves `editorMode` and `freeformText` across sessions
- **SCM title icon** – you can now choose between the standard editor and Git Editor mode via `scmTitleCommand`
- **FileSystemProvider** – replaced the old `TextDocumentContentProvider` with a proper `FileSystemProvider` for the Git Editor mode, enabling real save/auto‑apply

### Fixed

- **Git Editor read‑only issue** – resolved by using a `FileSystemProvider` (the document is now fully editable and savable)
- **Auto‑apply on save** – the Git Editor now correctly applies the message to SCM when you save (`Ctrl+S`) without requiring manual intervention

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

---

## Legend

- `Added` – new features
- `Changed` – changes to existing functionality
- `Deprecated` – soon‑to‑be removed features
- `Removed` – now removed features
- `Fixed` – bug fixes
- `Security` – vulnerability fixes

---

### compare

- [v1.7.0...develop](https://github.com/idmdakhi/GitCommitMessageEditor-vsce/compare/v1.7.0...develop)
- [1.1.3...v1.7.0](https://github.com/idmdakhi/GitCommitMessageEditor-vsce/compare/1.1.3...v1.7.0)
- [v1.1.0...1.1.3](https://github.com/idmdakhi/GitCommitMessageEditor-vsce/compare/v1.1.0...1.1.3)
- [v1.0.0...v1.1.0](https://github.com/idmdakhi/GitCommitMessageEditor-vsce/compare/v1.0.0...v1.1.0)

[1.7.0]: https://github.com/idmdakhi/GitCommitMessageEditor-vsce/releases/tag/v1.7.0
[1.0.0]: https://github.com/idmdakhi/GitCommitMessageEditor-vsce/releases/tag/v1.0.0
