import * as vscode from "vscode";
import { CommitEditorPanel } from "./panels/CommitEditorPanel";
import { ConfigEditorPanel } from "./panels/ConfigEditorPanel";
import { ConfigManager } from "./config/configManager";

let statusBarItem: vscode.StatusBarItem | undefined;

function createStatusBar() {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, //right
    90,
  );
  item.text = "$(edit)$(git-commit) Commit Msg";
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
