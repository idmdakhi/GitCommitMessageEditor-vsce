# Roadmap for a Modern “Commit Message Editor” (merging three extensions)

Goal: Combine the best features of all three into a single, modern extension.

---

## Phase 0 — Basic infrastructure

- [ ] Extension skeleton (TypeScript + esbuild/webpack)
- [ ] Integration with Source Control panel (Edit icon on the repo)
- [ ] Command Palette command: «Open Commit Message Editor»
- [ ] Support for multiple open repositories simultaneously + remember the selected repo in `workspaceState`
- [ ] “VS Code as Git Editor” mode (direct editing of `COMMIT_EDITMSG` without a real file, using VFS)
- [ ] Build `.vsix` package and publish to Marketplace

## Phase 1 — Form for building the message (Conventional Commits base)

- [ ] Default template: `type(scope): subject` + body + footer
- [ ] `type` field as a dropdown with full list (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, wip, initial)
- [ ] `scope` field (text)
- [ ] `subject` field
- [ ] `body` field (multiline)
- [ ] Conditional `BREAKING CHANGE` field (checkbox to enable)
- [ ] Reference fields: `Resolves` / `Refs` / `See also` / `Closes` (multi‑issue input, automatically adds `#`)
- [ ] Signature fields: `Signed-off-by`, `Co-authored-by`, `Reviewed-by`, `Tested-by`, `Acked-by`, `Reported-by`
- [ ] Only filled fields are included in the final message
- [ ] Live preview of the commit message
- [ ] “Insert into Source Control Input Box” button
- [ ] “Copy to clipboard” button
- [ ] “Reset form” button

## Phase 2 — Form customisation / configuration (from Bandra)

- [ ] Graphical Configuration Editor for defining custom templates
- [ ] Portable JSON config format with an official schema for validation in VS Code
- [ ] Separate `staticTemplate` (raw text view) and `dynamicTemplate` (form view)
- [ ] Define custom tokens/fields with types: text, boolean, enum
- [ ] Token properties: label, prefix, suffix, description, multiline, monospace, lines/maxLines, maxLength, maxLineLength, options (for enum), multiple/separator/combobox
- [ ] Export/Import configuration + save in User or Workspace settings
- [ ] Several ready‑to‑use sample templates: Default (Conventional Commits), Gitmoji, Angular, Simple
- [ ] Quick switch between templates from the top menu of the form
- [ ] Dedicated tab with a large Textarea for free‑form message writing

## Phase 3 — IntelliSense inside the text editor (from phoihos)

- [ ] Enable Autocomplete with `Ctrl+Space` or direct typing
- [ ] Auto‑complete `type` based on Conventional Commits
- [ ] Auto‑complete `scope`:
  - [ ] Manage user’s scope list (saved in `.vscode/settings.json`)
  - [ ] Auto‑extract Scope from existing commit history (grep from log)
  - [ ] “Create new Scope” option in the suggestion list
- [ ] Gitmoji completion triggered by `:` character (filter by selected commit type)
- [ ] `Footer Type` completion (Closes, Refs, BREAKING CHANGE)
- [ ] Issue number completion for `Closes` triggered by `#` — fetch from GitHub API (with authentication to increase Rate Limit)
- [ ] Commit completion for `Refs` from local repository history
- [ ] Hover on Type/Scope/Emoji in the first line and on Type/Issues/Commits in footers
- [ ] CodeLens «Recent commits...» for quick selection of a previous commit message (with dedicated shortcut)
- [ ] Automatic enforcement of Git 50/72 rule (ruler in editor settings)

## Phase 4 — Artificial Intelligence and smart automation

- [ ] “Draft with AI”: read the staged changes diff and suggest type/scope/subject/body
- [ ] Use the official `vscode.lm` API (compatible with GitHub Copilot Chat) – no separate API key needed
- [ ] Clear error message if Copilot Chat is disabled
- [ ] Detect issue number from branch name (e.g. `JIRA-123`, `feature/456`) and quickly add it to Resolves
- [ ] Suggest Scope from the paths of staged files (`git diff --staged --name-only`)
- [ ] “Autofill suggestions” button that fills only empty fields

## Phase 5 — User experience and productivity

- [ ] Sticky status dashboard at the top of the form:
  - [ ] Status chip for each section (green=complete / red=required&missing / grey=optional)
  - [ ] Click on a chip → focus on that field
  - [ ] Progress counter («X of N sections»)
  - [ ] Show number of warnings with a direct link to the relevant field
- [ ] Live validation:
  - [ ] Character counter for subject with configurable maximum
  - [ ] Warning for long lines in body
  - [ ] Style Lint: warning for trailing period, initial capital letter, past‑tense verb instead of imperative
- [ ] Remember most frequently used type/scope values as clickable chips
- [ ] Browse and select from recent commits (auto‑fill the form if the pattern matches)
- [ ] Open the form/dashboard in a full‑sized tab in the centre (in addition to the Sidebar)
- [ ] Sync state between Sidebar and full‑tab instances via workspaceState/globalState
- [ ] Status Bar item for quick access
- [ ] Save/restore form draft even after closing VS Code (`workspaceState` + `webview.getState`)

## Phase 6 — Additional Git operations

- [ ] Amend last commit: load the previous message into the form + replace after modal confirmation
- [ ] Undo last “Insert into Source Control” – restore the previous input box value
- [ ] “Auto‑format body” button (word‑wrap based on maxLineLength, preserving paragraphs)
- [ ] Register template as official Git `commit.template` (create `.gitmessage` + `git config commit.template`) so it can be used even from the terminal

## Phase 7 — Global settings and customisation

- [ ] `types` configurable from `settings.json`
- [ ] `autoFillSignedOffBy` (auto‑fill from `git config user.name/email`)
- [ ] `detectIssueFromBranch`
- [ ] `maxSubjectLength`, `maxLineLength`
- [ ] `rememberFrequentValues`
- [ ] `showRecentCommits` (+ `maxItems`)
- [ ] `emojiPrefix` (enable Gitmoji by default)
- [ ] `editor.keepAfterSave` (keep or close the tab after saving)
- [ ] `intelliSense.completion.logScopes.enabled`
- [ ] `intelliSense.completion.issues.pageSize`
- [ ] `intelliSense.hover.enabled`

## Phase 8 — Multilingual support and documentation

- [ ] Full i18n of the UI (Persian + English at minimum)
- [ ] Complete README documentation with screenshots and GIFs
- [ ] Public JSON Schema for the portable config file
- [ ] Sample ready‑to‑use templates (Default / Gitmoji / Angular / other languages such as Chinese)

## Phase 9 — Future features (optional / needs further investigation)

- [ ] Commit statistics and charts (would require Chart.js in a separate Webview)
- [ ] Display CI/CD status (would require connection to CI service APIs and token management)
- [ ] Automatic execution of pre‑commit hooks — **recommendation: do not implement** – better managed through Husky/lint‑staged to keep user control

---

## Suggested prioritisation for the modern MVP

1. Phase 0 and 1 (infrastructure + basic Conventional Commits form)
2. Phase 2 (Configurable Editor – the main differentiator from simpler competitors)
3. Phase 3 (IntelliSense in the actual editor – phoihos’ strength not found elsewhere)
4. Phase 5 (Status dashboard + validation – a distinctive user experience)
5. Phase 4 (AI Draft – an attractive feature for the 1.0 release)
6. Phases 6, 7, 8 gradually in later releases
7. Phase 9 only if there is real user demand
