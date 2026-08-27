import * as vscode from "vscode";
import { CommitEditorPanel } from "./panels/CommitEditorPanel";
import { ConfigEditorPanel } from "./panels/ConfigEditorPanel";
import { ConfigManager } from "./config/configManager";

export function activate(context: vscode.ExtensionContext) {
  const manager = new ConfigManager(context);

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    90,
  );
  statusBarItem.text = "$(edit) Commit Msg";
  statusBarItem.tooltip = "Open Commit Message Editor";
  statusBarItem.command = "gitCommitMessageEditor.open";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

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
  // nothing to clean up; panel dispose is handled by VS Code
}
