import * as vscode from "vscode";
import { CommitEditorPanel } from "./panels/CommitEditorPanel";
import { ConfigEditorPanel } from "./panels/ConfigEditorPanel";
import { ConfigManager } from "./config/configManager";
import { GitEditorProvider } from "./gitEditorProvider";

let statusBarItem: vscode.StatusBarItem | undefined;

function createStatusBar() {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  item.text = "$(edit) Commit Msg";
  item.tooltip = "Open Commit Message Editor";
  item.command = "gitCommitMessageEditor.open";
  item.show();
  return item;
}

function deactivateStatusBar(
  item: vscode.StatusBarItem | undefined,
): vscode.StatusBarItem | undefined {
  if (item) {
    item.dispose();
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext) {
  const manager = new ConfigManager(context);
  const gitEditorProvider = new GitEditorProvider(context);

  // ===== ثبت provider برای scheme gitcme =====
  // این کار باید قبل از هرگونه استفاده از URI انجام شود
  // یک FileSystemProvider واقعی (نه TextDocumentContentProvider) استفاده
  // می‌شود چون اسناد TextDocumentContentProvider همیشه read-only هستند.
  const providerRegistration = vscode.workspace.registerFileSystemProvider(
    "gitcme",
    gitEditorProvider,
    { isCaseSensitive: true },
  );
  context.subscriptions.push(providerRegistration);

  // ===== Status Bar =====
  const enableStatusBar = vscode.workspace
    .getConfiguration("gitCommitMessageEditor")
    .get<boolean>("enableStatusBar", false);
  if (enableStatusBar) {
    statusBarItem = createStatusBar();
    context.subscriptions.push(statusBarItem);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("gitCommitMessageEditor.enableStatusBar")) {
        const newValue = vscode.workspace
          .getConfiguration("gitCommitMessageEditor")
          .get<boolean>("enableStatusBar", false);
        if (newValue && !statusBarItem) {
          statusBarItem = createStatusBar();
          context.subscriptions.push(statusBarItem);
        } else if (!newValue && statusBarItem) {
          statusBarItem = deactivateStatusBar(statusBarItem);
        }
      }
    }),
  );

  // ===== Commands =====
  context.subscriptions.push(
    vscode.commands.registerCommand("gitCommitMessageEditor.open", () => {
      CommitEditorPanel.createOrShow(
        context,
        manager,
        vscode.ViewColumn.Active,
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

    // ===== Open as Git Editor =====
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.openAsGitEditor",
      async () => {
        const gitExt = vscode.extensions.getExtension("vscode.git");
        if (!gitExt) {
          vscode.window.showErrorMessage("Git extension not available.");
          return;
        }
        const gitApi = gitExt.exports.getAPI(1);
        if (!gitApi.repositories || gitApi.repositories.length === 0) {
          vscode.window.showErrorMessage("No Git repository found.");
          return;
        }

        const repo = gitApi.repositories[0];
        const cwd = repo.rootUri.fsPath;

        const draft = context.workspaceState.get<any>(
          "gitCommitMessageEditor.draft",
          undefined,
        );
        let initialContent = "";
        if (draft?.values) {
          const subject = draft.values.subject || "";
          const body = draft.values.body || "";
          initialContent = subject + (body ? `\n\n${body}` : "");
        }

        await gitEditorProvider.openEditor(cwd, initialContent);
      },
    ),

    // ===== Apply Git Editor message =====
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.applyGitEditorMessage",
      async () => {
        await gitEditorProvider.applyToGit();
      },
    ),

    // ===== Close Git Editor =====
    vscode.commands.registerCommand(
      "gitCommitMessageEditor.closeGitEditor",
      async () => {
        await gitEditorProvider.closeEditor();
      },
    ),
  );

  // ===== Event: Editor closed =====
  // Note: saving is now handled directly inside GitEditorProvider.writeFile(),
  // since it fires on every Ctrl+S against the gitcme FileSystemProvider.
  // The old onDidSaveTextDocument listener is no longer needed here.
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(async (editors) => {
      const uri = context.workspaceState.get<string>("gitcme.editorUri");
      if (!uri) return;
      const isOpen = editors.some((e) => e.document.uri.toString() === uri);
      if (!isOpen && gitEditorProvider.isOpen()) {
        await gitEditorProvider.closeEditor();
      }
    }),
  );
}

export function deactivate() {
  statusBarItem = deactivateStatusBar(statusBarItem);
}
