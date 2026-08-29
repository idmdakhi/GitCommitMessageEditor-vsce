import * as vscode from "vscode";
import { CommitEditorPanel } from "./panels/CommitEditorPanel";
import { ConfigEditorPanel } from "./panels/ConfigEditorPanel";
import { ConfigManager } from "./config/configManager";

let statusBarItem: vscode.StatusBarItem | undefined;

// ===== Git Editor Mode =====
const GIT_EDITOR_SCHEME = "gitcme";
const GIT_EDITOR_FILENAME = "COMMIT_EDITMSG";

class GitEditorProvider implements vscode.TextDocumentContentProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  private _content: string = "";
  private _cwd: string | undefined;
  private _uri: vscode.Uri | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async openEditor(cwd: string, initialContent: string = "") {
    this._cwd = cwd;
    this._content = initialContent;

    // ایجاد URI برای فایل مجازی
    this._uri = vscode.Uri.parse(`${GIT_EDITOR_SCHEME}:${GIT_EDITOR_FILENAME}`);

    // ثبت provider (اگر قبلاً ثبت نشده باشد)
    const providerReg = vscode.workspace.registerTextDocumentContentProvider(
      GIT_EDITOR_SCHEME,
      this,
    );
    this.context.subscriptions.push(providerReg);

    // باز کردن سند
    const doc = await vscode.workspace.openTextDocument(this._uri);
    const editor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.One,
      preview: false,
    });

    // تنظیمات ویرایشگر (ruler برای 50/72)
    await vscode.commands.executeCommand("editor.action.addCommentLine", {}); // فقط برای نمونه
    // تنظیم ruler با استفاده از تنظیمات موقت
    const config = vscode.workspace.getConfiguration("editor");
    await config.update("rulers", [50, 72], vscode.ConfigurationTarget.Global);

    // ذخیره‌سازی URI در context برای استفاده در listeners
    this.context.workspaceState.update(
      "gitcme.editorUri",
      this._uri.toString(),
    );
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    if (uri.toString() !== this._uri?.toString()) {
      return "";
    }
    // اگر محتوا خالی است، یک قالب پیش‌فرض نمایش بده
    if (!this._content.trim()) {
      return [
        "# Please enter the commit message for your changes.",
        "# Lines starting with '#' will be ignored.",
        "#",
        "# On branch main",
        "# Changes to be committed:",
        "#   (use 'git add ...' to update what will be committed)",
        "#   (use 'git restore ...' to discard changes in working directory)",
        "#",
        "# (empty message)",
        "",
        "",
      ].join("\n");
    }
    return this._content;
  }

  async saveContent(content: string) {
    this._content = content;
    this._onDidChange.fire(this._uri!);
  }

  async applyToGit() {
    // حذف خطوطی که با # شروع می‌شوند (نظرات)
    const cleanMessage = this._content
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n")
      .trim();

    if (!cleanMessage) {
      vscode.window.showWarningMessage("Commit message is empty.");
      return;
    }

    // اعمال به Git (از طریق همان logic موجود در CommitEditorPanel)
    // از api.git استفاده می‌کنیم
    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (!gitExt) {
      vscode.window.showErrorMessage("Git extension not available.");
      return;
    }
    const gitApi = gitExt.exports.getAPI(1);
    const repo = gitApi.repositories.find(
      (r: any) => r.rootUri.fsPath === this._cwd,
    );
    if (!repo) {
      vscode.window.showErrorMessage("Repository not found.");
      return;
    }

    // ذخیره در inputBox
    repo.inputBox.value = cleanMessage;
    vscode.window.showInformationMessage(
      "Commit message inserted into Source Control.",
    );

    // بستن ویرایشگر
    await this.closeEditor();
  }

  async closeEditor() {
    // بستن سند باز
    const uri = this._uri;
    if (uri) {
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uri?.toString(),
      );
      if (doc) {
        await vscode.window.showTextDocument(doc, { preview: true });
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
      }
    }
    // پاک کردن state
    this._uri = undefined;
    this._cwd = undefined;
    this._content = "";
    await this.context.workspaceState.update("gitcme.editorUri", undefined);
  }
}

function createStatusBar() {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, //right
    90,
  );
  item.text = "$(edit) Commit Msg";
  item.tooltip = "Open Commit Message Editor";
  item.command = "gitCommitMessageEditor.open";
  item.show();
  return item;
}

function deactivateStatusBar(statusBarItem: vscode.StatusBarItem | undefined) {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const manager = new ConfigManager(context);
  const gitEditorProvider = new GitEditorProvider(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.openAsGitEditor",
      async () => {
        // دریافت مخزن فعلی
        const gitExt = vscode.extensions.getExtension("vscode.git");
        if (!gitExt) {
          vscode.window.showErrorMessage("Git extension not available.");
          return;
        }
        const gitApi = gitExt.exports.getAPI(1);
        const repo = gitApi.repositories[0];
        if (!repo) {
          vscode.window.showErrorMessage("No Git repository found.");
          return;
        }

        const cwd = repo.rootUri.fsPath;

        // دریافت محتوای پیش‌فرض (از draft یا خالی)
        const draft = context.workspaceState.get<any>(
          "gitCommitMessageEditor.draft",
          undefined,
        );
        let initialContent = "";
        if (draft?.values) {
          // ساخت پیام از draft (با استفاده از ConfigManager)
          const activeConfig = manager.getActiveConfig(cwd);
          // ساده‌سازی: فقط subject و body را بگیریم
          if (activeConfig) {
            const values = draft.values;
            const subject = values.subject || "";
            const body = values.body || "";
            initialContent = subject + (body ? `\n\n${body}` : "");
          }
        }

        // باز کردن ویرایشگر
        await gitEditorProvider.openEditor(cwd, initialContent);
      },
    ),
  );

  // ذخیره‌سازی فایل (وقتی کاربر Ctrl+S می‌زند)
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const uri = context.workspaceState.get<string>("gitcme.editorUri");
      if (!uri) return;
      if (doc.uri.toString() === uri) {
        // محتوا را در provider به‌روز کن
        await gitEditorProvider.saveContent(doc.getText());
        // به‌طور خودکار اعمال کن (اختیاری)
        // await gitEditorProvider.applyToGit();
      }
    }),
  );

  // بستن ویرایشگر (وقتی تب بسته می‌شود)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
      const uri = context.workspaceState.get<string>("gitcme.editorUri");
      if (!uri) return;
      const isOpen = editors.some((e) => e.document.uri.toString() === uri);
      if (!isOpen) {
        // ویرایشگر بسته شده، پاک‌سازی
        await gitEditorProvider.closeEditor();
      }
    }),
  );

  // Status Bar
  const enableStatusBar = vscode.workspace
    .getConfiguration("gitCommitMessageEditor")
    .get<boolean>("enableStatusBar", false);
  if (enableStatusBar) {
    const statusBarItem = createStatusBar();
    context.subscriptions.push(statusBarItem);
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitCommitMessageEditor.enableStatusBar")) {
        const newValue = vscode.workspace
          .getConfiguration("gitCommitMessageEditor")
          .get<boolean>("enableStatusBar", false);
        if (newValue && !statusBarItem) {
          // ایجاد مجدد
          statusBarItem = createStatusBar();
          context.subscriptions.push(statusBarItem);
        } else if (!newValue && statusBarItem) {
          deactivateStatusBar(statusBarItem);
        }
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("gitCommitMessageEditor.open", () => {
      CommitEditorPanel.createOrShow(
        context,
        manager,
        vscode.ViewColumn.Active, // Beside
      );
    }),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.openInNewTab",
      () => {
        CommitEditorPanel.createOrShow(context, manager, vscode.ViewColumn.One);
      },
    ),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.openSettings",
      () => {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:idmdakhi.GitCommitMessageEditor-vsce",
        );
      },
    ),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.openConfigEditor",
      () => {
        ConfigEditorPanel.createOrShow(context, manager, () =>
          CommitEditorPanel.refreshIfOpen(),
        );
      },
    ),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.createProjectConfig",
      async () => {
        CommitEditorPanel.createOrShow(
          context,
          manager,
          vscode.ViewColumn.Beside,
        );
        setTimeout(() => {
          CommitEditorPanel.currentPanel?.createProjectConfigFile();
        }, 300);
      },
    ),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.amendLast",
      async () => {
        CommitEditorPanel.createOrShow(
          context,
          manager,
          vscode.ViewColumn.Beside,
        );
        setTimeout(() => {
          CommitEditorPanel.currentPanel?.loadLastCommitIntoForm();
        }, 300);
      },
    ),
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.undoLastInsert",
      async () => {
        vscode.commands.executeCommand("gitCommitMessageEditor.open");
      },
    ),
  );
}

export function deactivate() {
  deactivateStatusBar(statusBarItem);
}
