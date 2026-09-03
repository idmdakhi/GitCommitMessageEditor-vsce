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
  getFrequentValues,
} from "../utils/git";
import { getI18nDictionary, I18nManager } from "../i18n";
import { t } from "../i18n";

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
      t("title"),
      targetColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "assets"),
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
          t("status.copySuccess"),
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
            message: t("status.noGitRepo"),
          });
          break;
        }

        const identity = await getUserIdentity(cwd);

        if (!identity || (!identity.name && !identity.email)) {
          this.panel.webview.postMessage({
            type: "gitIdentityResult",
            value: "",
            message: t("status.gitIdentityNotFound"),
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

      case "openAsGitEditor":
        vscode.commands.executeCommand(
          "gitCommitMessageEditor.openAsGitEditor",
        );
        break;

      case "openSettings":
        vscode.commands.executeCommand("gitCommitMessageEditor.openSettings");
        break;

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

    const rememberFrequentTypes = this.cfg().get<boolean>(
      "rememberFrequentTypes",
      true,
    );
    const rememberFrequentScopes = this.cfg().get<boolean>(
      "rememberFrequentScopes",
      true,
    );
    const frequentValues =
      cwd && (rememberFrequentTypes || rememberFrequentScopes)
        ? await getFrequentValues(cwd)
        : { types: [], scopes: [] };

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
    const defaultEditorMode = this.cfg().get<string>(
      "defaultEditorMode",
      "form",
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
        rememberFrequentValues: this.cfg().get("rememberFrequentValues"), // @depracted
        rememberFrequentTypes,
        rememberFrequentScopes,
        emojiPrefix:
          projectConfig?.data.emojiPrefix ??
          this.cfg().get("emojiPrefix", false),
        autoGitmoji: this.cfg().get("autoGitmoji", false),
        frequentTypes: frequentValues.types,
        frequentScopes: frequentValues.scopes,
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
      defaultEditorMode,
      i18n: getI18nDictionary(),
      lang: I18nManager.getInstance().getLanguage(),
      dir: I18nManager.getInstance().getDirection(),
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
      vscode.window.showWarningMessage(t("status.noRepo"));
      return;
    }
    const targetUri = vscode.Uri.file(
      `${cwd}/.vscode/commit-message-template.json`,
    );
    try {
      await vscode.workspace.fs.stat(targetUri);
      const overwrite = await vscode.window.showWarningMessage(
        t("status.repoConfigExists"),
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
    vscode.window.showInformationMessage(t("status.repoConfigCreated"));
  }

  private async insertIntoScm(message: string) {
    const api = await activateGitExtension();
    if (!api) {
      vscode.window.showWarningMessage(t("status.gitExtensionInactive"));
      return;
    }
    const repo = pickRepository(api);
    if (!repo) {
      vscode.window.showWarningMessage(t("status.noGitRepo"));
      return;
    }
    await this.context.workspaceState.update(
      UNDO_STATE_KEY,
      repo.inputBox.value,
    );
    repo.inputBox.value = message;
    vscode.window.showInformationMessage(t("status.insertSuccess"));

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
      vscode.window.showInformationMessage(t("status.undoNothing"));
      return;
    }
    const api = await activateGitExtension();
    const repo = api ? pickRepository(api) : undefined;
    if (!repo) {
      vscode.window.showWarningMessage(t("status.noGitRepo"));
      return;
    }
    repo.inputBox.value = prev;
    await this.context.workspaceState.update(UNDO_STATE_KEY, undefined);
    vscode.window.showInformationMessage(t("status.undoSuccess"));
  }

  private async amendLast(message: string) {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      vscode.window.showWarningMessage(t("status.noRepo"));
      return;
    }
    const confirm = await vscode.window.showWarningMessage(
      t("status.amendConfirm"),
      { modal: true },
      "Yes, amend",
    );
    if (confirm !== "Yes, amend") {
      return;
    }
    try {
      await amendLastCommit(cwd, message);
      vscode.window.showInformationMessage(t("status.amendSuccess"));
    } catch (e: any) {
      vscode.window.showErrorMessage(
        t("status.amendFailed") + (e.message ?? e),
      );
    }
  }

  /** Register the current message as the official Git commit.template (usable from the terminal). */
  private async writeGitTemplate(message: string) {
    const cwd = await this.getRepoCwd();
    if (!cwd) {
      vscode.window.showWarningMessage(t("status.noRepo"));
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
            t("status.gitTemplateFailed") + err.message,
          );
        } else {
          vscode.window.showInformationMessage(t("status.gitTemplateSuccess"));
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
        message: t("status.noModel"),
      });
      return;
    }

    const cwd = await this.getRepoCwd();
    if (!cwd) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message: t("status.noRepo"),
      });
      return;
    }
    const diff = await getStagedDiff(cwd);
    if (!diff.trim()) {
      this.panel.webview.postMessage({
        type: "aiDraftError",
        message: t("status.noChanges"),
      });
      return;
    }

    try {
      const model = models[0];
      // این پرامپت برای مدل زبانی است، نه برای کاربر — عمداً همیشه به
      // انگلیسی می‌ماند: خروجی باید JSON با کلیدهای ثابت type/scope/subject/
      // body باشد، و ترجمه‌ی این دستورالعمل‌ها ریسک بی‌ثبات کردن آن قالب را
      // دارد بدون هیچ فایده‌ای برای کاربر (این متن هرگز در UI دیده نمی‌شود).
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
        message: t("status.aiError") + (e.message ?? e),
      });
    }
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "assets", "main.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "assets", "main.css"),
    );
    const nonce = getNonce();
    const i18nManager = I18nManager.getInstance();
    const lang = i18nManager.getLanguage();
    const dir = i18nManager.getDirection();

    return /* html */ `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>${escapeHtmlAttr(t("title"))}</title>
</head>
<body>
  <div id="app">${escapeHtmlAttr(t("loading"))}</div>
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
      return { name: t("repoInfo.noRepo"), branch: "N/A", stagedCount: 0 };
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

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
