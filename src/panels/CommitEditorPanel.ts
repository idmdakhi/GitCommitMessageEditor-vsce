import * as vscode from "vscode";
import { ConfigManager } from "../config/configManager";
import {
  loadProjectConfig,
  projectConfigToPortableConfig,
  starterProjectConfigJson,
} from "../config/projectConfig";
import {
  activateGitExtension,
  pickRepository,
  getUserIdentity,
  getCurrentBranch,
  getStagedDiff,
  getRecentCommits,
  getLastCommitMessage,
  amendLastCommit,
  guessScopeFromFiles,
  detectIssueFromBranchName,
  GitApiRepository,
  execGit,
  getStagedFiles,
} from "../utils/git";

const DRAFT_STATE_KEY = "gitCommitMessageEditor.draft";
const UNDO_STATE_KEY = "gitCommitMessageEditor.undoValue";

export class CommitEditorPanel {
  public static currentPanel: CommitEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    context: vscode.ExtensionContext,
    manager: ConfigManager,
    column?: vscode.ViewColumn,
  ) {
    const targetColumn = column ?? vscode.ViewColumn.Beside;

    if (CommitEditorPanel.currentPanel) {
      CommitEditorPanel.currentPanel.panel.reveal(targetColumn);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "gitCommitMessageEditor",
      "Commit Message Editor",
      targetColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "media"),
        ],
      },
    );

    CommitEditorPanel.currentPanel = new CommitEditorPanel(
      panel,
      context,
      manager,
    );
  }

  /** Called when the user activates another template from ConfigEditorPanel (live sync). */
  public static refreshIfOpen() {
    if (CommitEditorPanel.currentPanel) {
      CommitEditorPanel.currentPanel.sendInit();
    }
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private manager: ConfigManager,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  private cfg() {
    return vscode.workspace.getConfiguration("gitCommitMessageEditor");
  }

  private async getRepoCwd(): Promise<string | undefined> {
    const api = await activateGitExtension();
    if (!api) {
      return undefined;
    }
    const repo = pickRepository(api);
    return repo?.rootUri.fsPath;
  }

  private async handleMessage(msg: any) {
    switch (msg.type) {
      case "ready":
        await this.sendInit();
        break;
      case "insert":
        await this.insertIntoScm(msg.message as string);
        break;
      case "copy":
        await vscode.env.clipboard.writeText(msg.message as string);
        vscode.window.showInformationMessage(
          "Commit message copied to clipboard.",
        );
        break;
      case "saveDraft":
        await this.context.workspaceState.update(DRAFT_STATE_KEY, msg.draft);
        break;
      case "requestAutoSuggest":
        await this.sendAutoSuggestions();
        break;
      case "undoLastInsert":
        await this.undoLastInsert();
        break;
      case "amendLast":
        await this.amendLast(msg.message as string);
        break;
      case "aiDraft":
        await this.requestAiDraft();
        break;
      case "openConfigEditor":
        vscode.commands.executeCommand(
          "gitCommitMessageEditor.openConfigEditor",
        );
        break;
      case "writeGitTemplate":
        await this.writeGitTemplate(msg.message as string);
        break;
      case "createProjectConfig":
        await this.createProjectConfigFile();
        break;
      case "getRepoInfo": {
        const { repos, currentIndex } = await this.getRepoList();
        const currentInfo = await this.getCurrentRepoInfo();
        this.panel.webview.postMessage({
          type: "repoInfo",
          repos: repos.map((r) => ({
            name: r.rootUri.fsPath.split(/[\\/]/).pop() || "repo",
          })),
          currentIndex,
          currentInfo,
        });
        break;
      }
      case "switchRepo": {
        const idx = msg.index as number;
        const { repos } = await this.getRepoList();
        if (idx >= 0 && idx < repos.length) {
          // Store the selection in workspaceState
          await this.context.workspaceState.update(
            "gitCommitMessageEditor.lastRepoIndex",
            idx,
          );
          this.panel.webview.postMessage({
            type: "repoChanged",
            success: true,
          });
          // Re‑send init with the new repository
          await this.sendInit();
        } else {
          this.panel.webview.postMessage({
            type: "repoChanged",
            success: false,
          });
        }
        break;
      }
      case "addScope": {
        const scope = (msg.scope as string).trim();
        if (scope) {
          const scopes = this.cfg().get<string[]>("scopes", []);
          if (!scopes.includes(scope)) {
            await this.cfg().update(
              "scopes",
              [...scopes, scope],
              vscode.ConfigurationTarget.Workspace,
            );
            // Update UI
            await this.sendInit();
          }
        }
        break;
      }
      case "removeScope": {
        const scope = (msg.scope as string).trim();
        if (scope) {
          const scopes = this.cfg().get<string[]>("scopes", []);
          if (scopes.includes(scope)) {
            await this.cfg().update(
              "scopes",
              scopes.filter((s) => s !== scope),
              vscode.ConfigurationTarget.Workspace,
            );
            // Update UI
            await this.sendInit();
          }
        }
        break;
      }
      case "fetchGitIdentity": {
        const cwd = await this.getRepoCwd();

        if (!cwd) {
          this.panel.webview.postMessage({
            type: "gitIdentityResult",
            value: "",
            message: "No active Git repository found.",
          });
          break;
        }

        const identity = await getUserIdentity(cwd);

        if (!identity || (!identity.name && !identity.email)) {
          this.panel.webview.postMessage({
            type: "gitIdentityResult",
            value: "",
            message:
              "Git user.name / user.email are not configured for this repository.",
          });
          break;
        }

        const value = identity.email
          ? `${identity.name} <${identity.email}>`
          : identity.name;

        this.panel.webview.postMessage({
          type: "gitIdentityResult",
          value,
        });
        break;
      }
      default:
        break;
    }
  }

  public async sendInit() {
    const cwd = await this.getRepoCwd();
    const draft = this.context.workspaceState.get(DRAFT_STATE_KEY, undefined);
    const recentCommits =
      cwd && this.cfg().get<boolean>("showRecentCommits", true)
        ? await getRecentCommits(
            cwd,
            this.cfg().get<number>("recentCommitsMaxItems", 12),
          )
        : [];

    const { repos, currentIndex } = await this.getRepoList();
    const currentInfo = await this.getCurrentRepoInfo();
    // Load project defaults from repo (.commit-message-editor.json/.yaml/.yml) if present
    let projectConfig;
    let configSourceLabel = "extension template";
    try {
      projectConfig = cwd ? loadProjectConfig(cwd) : undefined;
    } catch (e: any) {
      vscode.window.showWarningMessage(e.message ?? String(e));
    }

    let activeConfig = this.manager.getActiveConfig(cwd);
    if (projectConfig) {
      configSourceLabel = `repo file (${projectConfig.fileName})`;
      const customTemplate = projectConfigToPortableConfig(
        activeConfig.name,
        projectConfig.data,
      );
      if (customTemplate) {
        activeConfig = customTemplate;
      }
    }

    const mergedScopes = Array.from(
      new Set([
        ...this.cfg().get<string[]>("scopes", []),
        ...(projectConfig?.data.scopes || []),
      ]),
    );

    this.panel.webview.postMessage({
      type: "init",
      config: activeConfig,
      activeConfigName: activeConfig.name,
      configSource: configSourceLabel,
      settings: {
        types: projectConfig?.data.types ?? this.cfg().get("types"),
        scopes: mergedScopes,
        maxSubjectLength:
          projectConfig?.data.maxSubjectLength ??
          this.cfg().get("maxSubjectLength"),
        maxLineLength:
          projectConfig?.data.maxLineLength ?? this.cfg().get("maxLineLength"),
        rememberFrequentValues: this.cfg().get("rememberFrequentValues"),
        emojiPrefix:
          projectConfig?.data.emojiPrefix ?? this.cfg().get("emojiPrefix"),
        autoGitmoji: this.cfg().get("autoGitmoji", true),
      },
      draft,
      recentCommits,
      hasRepo: !!cwd,
      hasProjectConfig: !!projectConfig,
      repoInfo: {
        repos: repos.map((r) => ({
          name: r.rootUri.fsPath.split(/[\\/]/).pop() || "repo",
        })),
        currentIndex,
        currentInfo,
      },
    });

    await this.sendAutoSuggestions(projectConfig?.data);
  }

  private async sendAutoSuggestions(projectOverride?: {
    autoFillSignedOffBy?: boolean;
    detectIssueFromBranch?: boolean;
  }) {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      return;
    }
    const suggestions: Record<string, string> = {};

    const autoFillSignedOffBy =
      projectOverride?.autoFillSignedOffBy ??
      this.cfg().get<boolean>("autoFillSignedOffBy", false);
    if (autoFillSignedOffBy) {
      const id = await getUserIdentity(cwd);
      if (id) {
        suggestions.signedOffBy = `${id.name} <${id.email}>`;
      }
    }

    const detectIssueFromBranch =
      projectOverride?.detectIssueFromBranch ??
      this.cfg().get<boolean>("detectIssueFromBranch", true);
    if (detectIssueFromBranch) {
      const branch = await getCurrentBranch(cwd);
      const issue = detectIssueFromBranchName(branch);
      if (issue) {
        suggestions.resolves = issue.replace(/^#/, "");
      }
    }

    const scope = await guessScopeFromFiles(cwd);
    if (scope) {
      suggestions.scope = scope;
    }

    this.panel.webview.postMessage({ type: "autoSuggestions", suggestions });
  }

  /** Create a sample config file at the repo root so the user can commit it for the team. */
  public async createProjectConfigFile() {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      vscode.window.showWarningMessage("No repository found.");
      return;
    }
    const targetUri = vscode.Uri.file(
      `${cwd}/.vscode/commit-message-template.json`,
    );
    try {
      await vscode.workspace.fs.stat(targetUri);
      const overwrite = await vscode.window.showWarningMessage(
        "commit-message-template.json already exists. Overwrite?",
        { modal: true },
        "Yes",
      );
      if (overwrite !== "Yes") {
        return;
      }
    } catch {
      // file does not exist, continue
    }
    await vscode.workspace.fs.writeFile(
      targetUri,
      Buffer.from(starterProjectConfigJson(), "utf8"),
    );
    const doc = await vscode.workspace.openTextDocument(targetUri);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(
      "Repo config file created. Edit and commit it to share with the team.",
    );
  }

  private async insertIntoScm(message: string) {
    const api = await activateGitExtension();
    if (!api) {
      vscode.window.showWarningMessage(
        "The built-in VS Code Git extension is not active.",
      );
      return;
    }
    const repo = pickRepository(api);
    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }
    await this.context.workspaceState.update(
      UNDO_STATE_KEY,
      repo.inputBox.value,
    );
    repo.inputBox.value = message;
    vscode.window.showInformationMessage(
      "Commit message inserted into Source Control.",
    );

    if (!this.cfg().get<boolean>("keepAfterSave", true)) {
      this.panel.dispose();
    }
    await vscode.commands.executeCommand("workbench.view.scm");
  }

  public async undoLastInsert() {
    const prev = this.context.workspaceState.get<string | undefined>(
      UNDO_STATE_KEY,
      undefined,
    );
    if (prev === undefined) {
      vscode.window.showInformationMessage(
        "Nothing to undo (no message has been inserted yet).",
      );
      return;
    }
    const api = await activateGitExtension();
    const repo = api ? pickRepository(api) : undefined;
    if (!repo) {
      vscode.window.showWarningMessage("No Git repository found.");
      return;
    }
    repo.inputBox.value = prev;
    await this.context.workspaceState.update(UNDO_STATE_KEY, undefined);
    vscode.window.showInformationMessage("Last insert undone.");
  }

  private async amendLast(message: string) {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      vscode.window.showWarningMessage("No repository found.");
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      "The last commit will be replaced with the new message. Continue?",
      { modal: true },
      "Yes, amend",
    );
    if (confirm !== "Yes, amend") {
      return;
    }
    try {
      await amendLastCommit(cwd, message);
      vscode.window.showInformationMessage("Last commit amended successfully.");
    } catch (e: any) {
      vscode.window.showErrorMessage(`Amend failed: ${e.message ?? e}`);
    }
  }

  /** Register the current message as the official Git commit.template (usable from the terminal). */
  private async writeGitTemplate(message: string) {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      vscode.window.showWarningMessage("No repository found.");
      return;
    }
    const uri = vscode.Uri.file(`${cwd}/.gitmessage`);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(message, "utf8"));
    const cp = require("child_process") as typeof import("child_process");
    cp.execFile(
      "git",
      ["config", "commit.template", ".gitmessage"],
      { cwd },
      (err) => {
        if (err) {
          vscode.window.showErrorMessage(
            `Failed to set commit.template: ${err.message}`,
          );
        } else {
          vscode.window.showInformationMessage(
            "Message registered as commit.template (.gitmessage).",
          );
        }
      },
    );
  }

  public async loadLastCommitIntoForm() {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      return;
    }
    const message = await getLastCommitMessage(cwd);
    this.panel.webview.postMessage({ type: "loadRawMessage", message });
  }

  private async requestAiDraft() {
    let models: vscode.LanguageModelChat[] = [];
    try {
      models = await vscode.lm.selectChatModels({ vendor: "copilot" });
    } catch {
      models = [];
    }
    if (!models || models.length === 0) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message:
          "No language model available. Please install GitHub Copilot Chat and sign in.",
      });
      return;
    }

    const cwd = await this.getRepoCwd();
    if (!cwd) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message: "No repository found.",
      });
      return;
    }
    const diff = await getStagedDiff(cwd);
    if (!diff.trim()) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message: "No changes to analyze (nothing staged).",
      });
      return;
    }

    try {
      const model = models[0];
      const prompt = [
        "You are a commit message assistant. Analyze this git diff and respond ONLY with a compact JSON object",
        "with keys: type, scope, subject, body. type must be one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, wip.",
        "subject must be imperative mood, under 72 chars, no trailing period. body optional, wrap at 100 chars.",
        "No markdown fences, no extra text, JSON only.",
        "",
        "DIFF:",
        diff.slice(0, 12000),
      ].join("\n");

      const chatRequest = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        new vscode.CancellationTokenSource().token,
      );

      let full = "";
      for await (const fragment of chatRequest.text) {
        full += fragment;
      }
      const cleaned = full.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      this.panel.webview.postMessage({ type: "aiDraftResult", draft: parsed });
    } catch (e: any) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message: `AI draft error: ${e.message ?? e}`,
      });
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "media", "main.css"),
    );
    const nonce = getNonce();

    return /* html */ `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Commit Message Editor</title>
</head>
<body>
  <div id="app">Loading...</div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    CommitEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  // New variables
  private repoCache: {
    repos: GitApiRepository[];
    currentIndex: number;
  } | null = null;

  // ===== New method to get information about all repositories =====
  private async getRepoList(): Promise<{
    repos: GitApiRepository[];
    currentIndex: number;
  }> {
    const api = await activateGitExtension();
    if (!api || !api.repositories.length) {
      return { repos: [], currentIndex: -1 };
    }
    // پیدا کردن مخزن فعال (بر اساس workspace folder یا اولین)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    let index = 0;
    if (workspaceFolder) {
      const uri = workspaceFolder.uri;
      const found = api.repositories.findIndex(
        (r) => r.rootUri.fsPath === uri.fsPath,
      );
      if (found !== -1) index = found;
    }
    return { repos: api.repositories, currentIndex: index };
  }

  // ===== New method to get information about the current repository =====
  private async getCurrentRepoInfo() {
    const { repos, currentIndex } = await this.getRepoList();
    if (!repos.length || currentIndex < 0) {
      return { name: "no repo", branch: "N/A", stagedCount: 0 };
    }
    const repo = repos[currentIndex];
    const name = repo.rootUri.fsPath.split(/[\\/]/).pop() || "unknown";
    let branch = "detached";
    try {
      const b = await getCurrentBranch(repo.rootUri.fsPath);
      branch = b || "detached";
    } catch {}
    let stagedCount = 0;
    try {
      const files = await getStagedFiles(repo.rootUri.fsPath);
      stagedCount = files.length;
    } catch {}
    return { name, branch, stagedCount };
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
