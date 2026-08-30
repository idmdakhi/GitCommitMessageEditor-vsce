// tests/unit/gitEditorProvider.test.ts
import { GitEditorProvider } from "../../src/gitEditorProvider";
import * as vscode from "vscode";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));
import { execSync } from "child_process";

function makeContext(): any {
  return {
    subscriptions: [],
    workspaceState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function makeConfig(getValues: Record<string, any> = {}) {
  return {
    get: jest.fn((key: string, defaultValue?: any) =>
      key in getValues ? getValues[key] : defaultValue,
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function mockGitExtension(repos: any[]) {
  (vscode.extensions.getExtension as jest.Mock).mockReturnValue({
    isActive: true,
    exports: {
      getAPI: () => ({ repositories: repos }),
    },
  });
}

describe("GitEditorProvider", () => {
  let context: any;
  let provider: GitEditorProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    (execSync as jest.Mock).mockReturnValue("");
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      makeConfig({ autoApplyGitEditor: true }),
    );
    (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);

    context = makeContext();
    provider = new GitEditorProvider(context);
  });

  describe("openEditor", () => {
    it("opens the virtual document, shows it, and records the URI in workspaceState", async () => {
      await provider.openEditor("/repo", "feat: add thing");

      expect(provider.isOpen()).toBe(true);
      expect(provider.getUri()?.toString()).toBe("gitcme:/COMMIT_EDITMSG");
      expect(provider.getContent()).toBe("feat: add thing");
      expect(vscode.window.showTextDocument).toHaveBeenCalled();
      expect(context.workspaceState.update).toHaveBeenCalledWith(
        "gitcme.editorUri",
        "gitcme:/COMMIT_EDITMSG",
      );
      expect(vscode.window.showInformationMessage).toHaveBeenCalled();
    });

    it("falls back to a generated template message when no initial content is given", async () => {
      mockGitExtension([
        { rootUri: { fsPath: "/repo" }, state: { HEAD: { name: "main" } } },
      ]);
      (execSync as jest.Mock).mockReturnValue("a.ts\nb.ts\n");

      await provider.openEditor("/repo", "");

      const content = provider.getContent();
      expect(content).toContain("# On branch main");
      expect(content).toContain("#   a.ts");
      expect(content).toContain("#   b.ts");
      expect(content).toContain(
        "------------------------ >8 ------------------------",
      );
    });

    it("reports '(no changes staged)' when there are no staged files", async () => {
      mockGitExtension([
        { rootUri: { fsPath: "/repo" }, state: { HEAD: { name: "main" } } },
      ]);
      (execSync as jest.Mock).mockReturnValue("");

      await provider.openEditor("/repo", "");

      expect(provider.getContent()).toContain("(no changes staged)");
    });
  });

  describe("FileSystemProvider surface (readFile/writeFile/stat)", () => {
    it("readFile returns the current content as UTF-8 bytes for the active URI", async () => {
      await provider.openEditor("/repo", "hello world");
      const uri = provider.getUri()!;

      const bytes = provider.readFile(uri);
      expect(new TextDecoder().decode(bytes)).toBe("hello world");
    });

    it("readFile/stat throw FileNotFound for any other URI", async () => {
      await provider.openEditor("/repo", "hello world");
      const otherUri = vscode.Uri.parse("gitcme:/something-else");

      expect(() => provider.readFile(otherUri)).toThrow();
      expect(() => provider.stat(otherUri)).toThrow();
    });

    it("writeFile updates content and fires onDidChangeFile", async () => {
      await provider.openEditor("/repo", "old content");
      const uri = provider.getUri()!;

      const changes: vscode.FileChangeEvent[][] = [];
      provider.onDidChangeFile((e) => changes.push(e));

      const bytes = new TextEncoder().encode("new content");
      provider.writeFile(uri, bytes, { create: false, overwrite: true });

      expect(provider.getContent()).toBe("new content");
      expect(changes).toHaveLength(1);
      expect(changes[0][0].type).toBe(vscode.FileChangeType.Changed);
    });

    it("stat reports the byte size of the current content", async () => {
      await provider.openEditor("/repo", "abc");
      const uri = provider.getUri()!;

      const stat = provider.stat(uri);
      expect(stat.type).toBe(vscode.FileType.File);
      expect(stat.size).toBe(3);
    });
  });

  describe("saving auto-applies to git (replaces the old onDidSaveTextDocument flow)", () => {
    it("auto-applies to the SCM input box on save when autoApplyGitEditor is true", async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
        makeConfig({ autoApplyGitEditor: true }),
      );
      const inputBox = { value: "" };
      mockGitExtension([{ rootUri: { fsPath: "/repo" }, inputBox }]);

      await provider.openEditor("/repo", "");
      const uri = provider.getUri()!;

      provider.writeFile(
        uri,
        new TextEncoder().encode("fix: bug\n\n# comment"),
        { create: false, overwrite: true },
      );

      // applyToGit() is fire-and-forget inside writeFile; flush microtasks
      await Promise.resolve();
      await Promise.resolve();

      expect(inputBox.value).toBe("fix: bug");
    });

    it("shows an informational message instead of applying when autoApplyGitEditor is false", async () => {
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
        makeConfig({ autoApplyGitEditor: false }),
      );
      const inputBox = { value: "" };
      mockGitExtension([{ rootUri: { fsPath: "/repo" }, inputBox }]);

      await provider.openEditor("/repo", "");
      const uri = provider.getUri()!;

      provider.writeFile(uri, new TextEncoder().encode("fix: bug"), {
        create: false,
        overwrite: true,
      });

      await Promise.resolve();
      await Promise.resolve();

      expect(inputBox.value).toBe("");
      expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining("Apply Git Editor Message"),
      );
    });
  });

  describe("applyToGit", () => {
    it("strips comment lines before applying the message", async () => {
      const inputBox = { value: "" };
      mockGitExtension([{ rootUri: { fsPath: "/repo" }, inputBox }]);

      await provider.openEditor(
        "/repo",
        "feat: thing\n# this is a comment\nbody text",
      );

      const result = await provider.applyToGit();

      expect(result).toBe(true);
      expect(inputBox.value).toBe("feat: thing\nbody text");
    });

    it("warns and does nothing if there is no content or cwd", async () => {
      const result = await provider.applyToGit();
      expect(result).toBe(false);
      expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
        "No commit message to apply.",
      );
    });

    it("asks for confirmation when the message is empty after stripping comments, and respects Cancel", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Cancel",
      );
      await provider.openEditor("/repo", "# only a comment");

      const result = await provider.applyToGit();

      expect(result).toBe(false);
    });

    it("applies an empty message when the user confirms 'Continue with empty message'", async () => {
      (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(
        "Continue with empty message",
      );
      const inputBox = { value: "previous" };
      mockGitExtension([{ rootUri: { fsPath: "/repo" }, inputBox }]);

      await provider.openEditor("/repo", "# only a comment");
      const result = await provider.applyToGit();

      expect(result).toBe(true);
      expect(inputBox.value).toBe("");
    });

    it("fails gracefully when the git extension is not active", async () => {
      (vscode.extensions.getExtension as jest.Mock).mockReturnValue(undefined);
      await provider.openEditor("/repo", "feat: thing");

      const result = await provider.applyToGit();

      expect(result).toBe(false);
      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        "Git extension not available.",
      );
    });
  });

  describe("closeEditor / isOpen", () => {
    it("resets state after closing", async () => {
      await provider.openEditor("/repo", "feat: thing");
      expect(provider.isOpen()).toBe(true);

      await provider.closeEditor();

      expect(provider.isOpen()).toBe(false);
      expect(provider.getUri()).toBeUndefined();
      expect(provider.getContent()).toBe("");
      expect(context.workspaceState.update).toHaveBeenCalledWith(
        "gitcme.editorUri",
        undefined,
      );
    });

    it("is a no-op when nothing is open", async () => {
      await expect(provider.closeEditor()).resolves.toBeUndefined();
    });
  });

  describe("refresh / dispose", () => {
    it("refresh fires onDidChangeFile for the current URI", async () => {
      await provider.openEditor("/repo", "hello");
      const changes: vscode.FileChangeEvent[][] = [];
      provider.onDidChangeFile((e) => changes.push(e));

      provider.refresh();

      expect(changes).toHaveLength(1);
    });

    it("dispose closes the editor without throwing", async () => {
      await provider.openEditor("/repo", "hello");
      await expect(
        Promise.resolve(provider.dispose()),
      ).resolves.toBeUndefined();
    });
  });
});
