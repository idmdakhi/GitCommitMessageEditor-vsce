import * as vscode from "vscode";
import { t } from "./i18n";

/**
 * GitEditorProvider - Virtual, EDITABLE file provider for COMMIT_EDITMSG.
 *
 * Uses a real vscode.FileSystemProvider (not TextDocumentContentProvider)
 * on the custom 'gitcme' scheme. TextDocumentContentProvider documents are
 * always read-only in VS Code - there is no setting or command that makes
 * them editable. A FileSystemProvider is the correct VFS mechanism for an
 * in-memory file the user can type into and save.
 */
export class GitEditorProvider implements vscode.FileSystemProvider {
  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this._emitter.event;

  private _content: string = "";
  private _cwd: string | undefined;
  private _uri: vscode.Uri | undefined;
  private _isOpen: boolean = false;
  private _isApplying: boolean = false;
  private _ctime: number = Date.now();
  private _mtime: number = Date.now();

  constructor(private context: vscode.ExtensionContext) {}

  // ============================================================
  // FileSystemProvider implementation
  // ============================================================

  watch(): vscode.Disposable {
    // Single in-memory file, nothing external to watch.
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    this.checkUri(uri);
    return {
      type: vscode.FileType.File,
      ctime: this._ctime,
      mtime: this._mtime,
      size: Buffer.byteLength(this._content, "utf8"),
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {
    // No-op: this is a flat, single-file VFS.
  }

  readFile(uri: vscode.Uri): Uint8Array {
    this.checkUri(uri);
    if (!this._content) {
      this._content = this.getTemplateMessage();
    }
    return new TextEncoder().encode(this._content);
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): void {
    this.checkUri(uri);
    // Copy into a plain Uint8Array<ArrayBuffer> rather than holding a
    // reference to the buffer VS Code handed us (it may be typed as
    // Uint8Array<ArrayBufferLike>, e.g. backed by a SharedArrayBuffer).
    const bytes = new Uint8Array(content.byteLength);
    bytes.set(content);
    this._content = new TextDecoder().decode(bytes);
    this._mtime = Date.now();

    this._emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);

    // Saving the virtual file is what used to be driven by
    // onDidSaveTextDocument in extension.ts. Handle it directly here so it
    // actually fires (it never did under TextDocumentContentProvider).
    void this.handleSave();
  }

  delete(): void {
    // Not supported / not needed for this single virtual file.
    throw vscode.FileSystemError.NoPermissions("Delete not supported");
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions("Rename not supported");
  }

  private checkUri(uri: vscode.Uri): void {
    if (!this._uri || uri.toString() !== this._uri.toString()) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  // ============================================================
  // Public API (unchanged surface used by extension.ts)
  // ============================================================

  /**
   * Open the virtual COMMIT_EDITMSG editor
   */
  async openEditor(cwd: string, initialContent: string = ""): Promise<void> {
    // If already open, reveal it
    if (this._isOpen && this._uri) {
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === this._uri?.toString(),
      );
      if (doc) {
        await vscode.window.showTextDocument(doc, {
          viewColumn: vscode.ViewColumn.One,
          preview: false,
        });
        return;
      }
    }

    this._cwd = cwd;
    this._content = initialContent || this.getTemplateMessage();
    this._ctime = Date.now();
    this._mtime = Date.now();
    this._isOpen = true;

    // Virtual URI on our custom scheme, backed by the FileSystemProvider
    // registered in extension.ts.
    this._uri = vscode.Uri.parse("gitcme:/COMMIT_EDITMSG");

    try {
      const doc = await vscode.workspace.openTextDocument(this._uri);

      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.One,
        preview: false,
      });

      // No readonly workarounds needed: a FileSystemProvider-backed
      // document is editable and savable out of the box.

      await this.setRulers();

      await this.context.workspaceState.update(
        "gitcme.editorUri",
        this._uri.toString(),
      );

      vscode.window.showInformationMessage(t("status.gitEditorOpen"));
    } catch (error: any) {
      vscode.window.showErrorMessage(
        t("status.gitEditorFailed") + (error.message || error),
      );
      this._isOpen = false;
      this._uri = undefined;
    }
  }

  /**
   * Get a template message with comments and instructions
   */
  private getTemplateMessage(): string {
    const branch = this.getCurrentBranch();
    const stagedFiles = this.getStagedFiles();

    const lines: string[] = [
      "# Please enter the commit message for your changes.",
      "# Lines starting with '#' will be ignored.",
      "#",
      `# On branch ${branch}`,
      "# Changes to be committed:",
    ];

    if (stagedFiles.length === 0) {
      lines.push("#   (no changes staged)");
    } else {
      for (const file of stagedFiles.slice(0, 10)) {
        lines.push(`#   ${file}`);
      }
      if (stagedFiles.length > 10) {
        lines.push(`#   ... and ${stagedFiles.length - 10} more files`);
      }
    }

    lines.push(
      "#",
      "# ------------------------ >8 ------------------------",
      "# Do not modify or remove the line above.",
      "# Everything below it will be ignored.",
      "#",
      "# (empty message)",
      "",
      "",
    );

    return lines.join("\n");
  }

  /**
   * Get current branch name from Git
   */
  private getCurrentBranch(): string {
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git");
      if (gitExt?.isActive) {
        const gitApi = gitExt.exports.getAPI(1);
        if (gitApi && this._cwd) {
          const repo = gitApi.repositories.find(
            (r: any) => r.rootUri.fsPath === this._cwd,
          );
          if (repo?.state?.HEAD?.name) {
            return repo.state.HEAD.name;
          }
        }
      }
    } catch {
      // Ignore
    }
    return "unknown";
  }

  /**
   * Get list of staged files
   */
  private getStagedFiles(): string[] {
    try {
      const { execSync } = require("child_process");
      const output = execSync("git diff --staged --name-only", {
        cwd: this._cwd,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      });
      return output.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Set rulers for Git 50/72 convention
   */
  private async setRulers(): Promise<void> {
    try {
      await vscode.commands.executeCommand(
        "workbench.action.configureEditorRulers",
        [50, 72],
      );
    } catch {
      // Ignore errors - rulers are not critical
    }
  }

  /**
   * Called internally whenever writeFile() runs (i.e. the user saved).
   * This replaces the old onDidSaveTextDocument-driven saveContent() call
   * in extension.ts, since that event never fired reliably against a
   * TextDocumentContentProvider document.
   */
  private async handleSave(): Promise<void> {
    const autoApply = vscode.workspace
      .getConfiguration("gitCommitMessageEditor")
      .get<boolean>("autoApplyGitEditor", true);
    if (autoApply) {
      await this.applyToGit();
    } else {
      vscode.window.showInformationMessage(
        t("status.gitEditorSaved"),
      );
    }
  }

  /**
   * Save new content and notify listeners.
   * Kept for backward compatibility / manual invocation; writeFile() now
   * handles this automatically on every Ctrl+S.
   */
  async saveContent(content: string): Promise<void> {
    this._content = content;
    this._mtime = Date.now();
    if (this._uri) {
      this._emitter.fire([
        { type: vscode.FileChangeType.Changed, uri: this._uri },
      ]);
    }
  }

  /**
   * Get current content
   */
  getContent(): string {
    return this._content;
  }

  /**
   * Get current URI
   */
  getUri(): vscode.Uri | undefined {
    return this._uri;
  }

  /**
   * Check if editor is open
   */
  isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * Apply the commit message to Git SCM input box
   */
  async applyToGit(): Promise<boolean> {
    if (this._isApplying) {
      return false;
    }

    this._isApplying = true;

    try {
      if (!this._content || !this._cwd) {
        vscode.window.showWarningMessage(t("status.noMessageToApply"));
        return false;
      }

      // Remove comment lines (starting with '#')
      const cleanMessage = this._content
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n")
        .trim();

      if (!cleanMessage) {
        const continueLabel = t("status.continueEmpty");
        const result = await vscode.window.showWarningMessage(
          t("status.emptyMessageConfirm"),
          continueLabel,
          t("status.cancel"),
        );
        if (result === continueLabel) {
          return await this.applyCleanMessage("");
        }
        return false;
      }

      return await this.applyCleanMessage(cleanMessage);
    } finally {
      this._isApplying = false;
    }
  }

  /**
   * Apply a clean message to Git
   */
  private async applyCleanMessage(message: string): Promise<boolean> {
    const gitExt = vscode.extensions.getExtension("vscode.git");
    if (!gitExt?.isActive) {
      vscode.window.showErrorMessage(t("status.gitExtensionNotAvailable"));
      return false;
    }

    const gitApi = gitExt.exports.getAPI(1);
    const repo = gitApi.repositories.find(
      (r: any) => r.rootUri.fsPath === this._cwd,
    );

    if (!repo) {
      vscode.window.showErrorMessage(t("status.repositoryNotFound"));
      return false;
    }

    repo.inputBox.value = message;
    vscode.window.showInformationMessage(
      t("status.insertSuccess"),
    );

    // Close the editor after a short delay
    setTimeout(() => {
      this.closeEditor();
    }, 1000);

    return true;
  }

  /**
   * Close the virtual editor
   */
  async closeEditor(): Promise<void> {
    if (!this._uri || !this._isOpen) {
      return;
    }

    try {
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === this._uri?.toString(),
      );
      if (doc) {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand(
          "workbench.action.closeActiveEditor",
        );
      }
    } catch {
      // Ignore errors
    }

    // Clean up
    this._uri = undefined;
    this._cwd = undefined;
    this._content = "";
    this._isOpen = false;
    await this.context.workspaceState.update("gitcme.editorUri", undefined);
  }

  /**
   * Force refresh the document content
   */
  refresh(): void {
    if (this._uri) {
      this._emitter.fire([
        { type: vscode.FileChangeType.Changed, uri: this._uri },
      ]);
    }
  }

  /**
   * Dispose the provider
   */
  dispose(): void {
    this._emitter.dispose();
    this.closeEditor();
  }
}
