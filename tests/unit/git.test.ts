import { EventEmitter } from "events";

// ---- Mock child_process before importing the module under test ----
jest.mock("child_process", () => ({
  execFile: jest.fn(),
  spawn: jest.fn(),
}));

import * as cp from "child_process";
import {
  execGit,
  getUserIdentity,
  getCurrentBranch,
  getStagedFiles,
  getStagedDiff,
  getRecentCommits,
  getLastCommitMessage,
  amendLastCommit,
  guessScopeFromFiles,
  detectIssueFromBranchName,
  pickRepository,
  getRepositoryByIndex,
  getGitApi,
  activateGitExtension,
  getRepoInfo,
  GitApiRepository,
} from "../../src/utils/git";
import { __mockState, __resetMockState } from "../__mocks__/vscode";

const mockExecFile = cp.execFile as unknown as jest.Mock;
const mockSpawn = cp.spawn as unknown as jest.Mock;

/** Helper to make execFile call its callback with the given stdout / error. */
function mockExecFileOnce(stdout: string, err: Error | null = null) {
  mockExecFile.mockImplementationOnce(
    (_cmd: string, _args: string[], _opts: any, cb: any) => {
      cb(err, stdout, "");
    },
  );
}

/** Helper to build a fake child process object usable by amendLastCommit's spawn(). */
function makeFakeChildProcess() {
  const child: any = new EventEmitter();
  child.stdin = {
    write: jest.fn(),
    end: jest.fn(),
  };
  child.stderr = new EventEmitter();
  return child;
}

describe("utils/git", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
    mockSpawn.mockReset();
    __resetMockState();
  });

  describe("execGit", () => {
    it("resolves with stdout on success", async () => {
      mockExecFileOnce("hello world\n");
      const out = await execGit(["status"], "/repo");
      expect(out).toBe("hello world\n");
      expect(mockExecFile).toHaveBeenCalledWith(
        "git",
        ["status"],
        { cwd: "/repo" },
        expect.any(Function),
      );
    });

    it("rejects when execFile errors", async () => {
      mockExecFileOnce("", new Error("boom"));
      await expect(execGit(["status"], "/repo")).rejects.toThrow("boom");
    });
  });

  describe("getUserIdentity", () => {
    it("returns name and email when both are configured", async () => {
      mockExecFileOnce("Jane Doe\n");
      mockExecFileOnce("jane@example.com\n");
      const identity = await getUserIdentity("/repo");
      expect(identity).toEqual({ name: "Jane Doe", email: "jane@example.com" });
    });

    it("returns undefined when neither name nor email is set", async () => {
      mockExecFileOnce("\n");
      mockExecFileOnce("\n");
      const identity = await getUserIdentity("/repo");
      expect(identity).toBeUndefined();
    });

    it("returns undefined when git config throws", async () => {
      mockExecFileOnce("", new Error("not a git repo"));
      const identity = await getUserIdentity("/repo");
      expect(identity).toBeUndefined();
    });
  });

  describe("getCurrentBranch", () => {
    it("returns the trimmed branch name", async () => {
      mockExecFileOnce("main\n");
      const branch = await getCurrentBranch("/repo");
      expect(branch).toBe("main");
    });

    it("returns undefined for an empty result", async () => {
      mockExecFileOnce("\n");
      const branch = await getCurrentBranch("/repo");
      expect(branch).toBeUndefined();
    });

    it("returns undefined when the command fails", async () => {
      mockExecFileOnce("", new Error("fail"));
      const branch = await getCurrentBranch("/repo");
      expect(branch).toBeUndefined();
    });
  });

  describe("getStagedFiles", () => {
    it("returns staged files when present", async () => {
      mockExecFileOnce("src/a.ts\nsrc/b.ts\n");
      const files = await getStagedFiles("/repo");
      expect(files).toEqual(["src/a.ts", "src/b.ts"]);
    });

    it("falls back to unstaged diff when nothing is staged", async () => {
      mockExecFileOnce(""); // staged diff empty
      mockExecFileOnce("src/c.ts\n"); // unstaged diff
      const files = await getStagedFiles("/repo");
      expect(files).toEqual(["src/c.ts"]);
    });

    it("returns an empty array on error", async () => {
      mockExecFileOnce("", new Error("fail"));
      const files = await getStagedFiles("/repo");
      expect(files).toEqual([]);
    });
  });

  describe("getStagedDiff", () => {
    it("returns the staged diff when non-empty", async () => {
      mockExecFileOnce("diff --git a/x b/x\n+added\n");
      const diff = await getStagedDiff("/repo");
      expect(diff).toContain("+added");
    });

    it("falls back to the full diff when staged diff is empty", async () => {
      mockExecFileOnce("   \n"); // staged diff, only whitespace
      mockExecFileOnce("diff --git a/y b/y\n+changed\n");
      const diff = await getStagedDiff("/repo");
      expect(diff).toContain("+changed");
    });

    it("returns an empty string on error", async () => {
      mockExecFileOnce("", new Error("fail"));
      const diff = await getStagedDiff("/repo");
      expect(diff).toBe("");
    });
  });

  describe("getRecentCommits", () => {
    it("parses hash/subject/body separated log output", async () => {
      const sep = "\u0001";
      const rec = "\u0002";
      const raw =
        `abc123${sep}Fix bug${sep}Body line 1${rec}` +
        `def456${sep}Add feature${sep}${rec}`;
      mockExecFileOnce(raw);

      const commits = await getRecentCommits("/repo", 12);
      expect(commits).toEqual([
        { hash: "abc123", subject: "Fix bug", body: "Body line 1" },
        { hash: "def456", subject: "Add feature", body: "" },
      ]);
    });

    it("returns an empty array when the log is empty", async () => {
      mockExecFileOnce("");
      const commits = await getRecentCommits("/repo", 12);
      expect(commits).toEqual([]);
    });

    it("returns an empty array on error", async () => {
      mockExecFileOnce("", new Error("fail"));
      const commits = await getRecentCommits("/repo", 12);
      expect(commits).toEqual([]);
    });
  });

  describe("getLastCommitMessage", () => {
    it("strips trailing newlines", async () => {
      mockExecFileOnce("feat: add thing\n\nbody text\n\n\n");
      const msg = await getLastCommitMessage("/repo");
      expect(msg).toBe("feat: add thing\n\nbody text");
    });

    it("returns an empty string on error", async () => {
      mockExecFileOnce("", new Error("fail"));
      const msg = await getLastCommitMessage("/repo");
      expect(msg).toBe("");
    });
  });

  describe("amendLastCommit", () => {
    it("writes the message to stdin and resolves on exit code 0", async () => {
      const fakeChild = makeFakeChildProcess();
      mockSpawn.mockReturnValue(fakeChild);

      const promise = amendLastCommit("/repo", "new message");
      // allow the microtask that registers listeners to run
      await Promise.resolve();
      fakeChild.emit("close", 0);

      await expect(promise).resolves.toBeUndefined();
      expect(mockSpawn).toHaveBeenCalledWith(
        "git",
        ["commit", "--amend", "-F", "-"],
        { cwd: "/repo" },
      );
      expect(fakeChild.stdin.write).toHaveBeenCalledWith("new message");
      expect(fakeChild.stdin.end).toHaveBeenCalled();
    });

    it("rejects with stderr content on non-zero exit code", async () => {
      const fakeChild = makeFakeChildProcess();
      mockSpawn.mockReturnValue(fakeChild);

      const promise = amendLastCommit("/repo", "bad message");
      await Promise.resolve();
      fakeChild.stderr.emit("data", Buffer.from("something went wrong"));
      fakeChild.emit("close", 1);

      await expect(promise).rejects.toThrow("something went wrong");
    });

    it("rejects with a generic message when stderr is empty", async () => {
      const fakeChild = makeFakeChildProcess();
      mockSpawn.mockReturnValue(fakeChild);

      const promise = amendLastCommit("/repo", "bad message");
      await Promise.resolve();
      fakeChild.emit("close", 7);

      await expect(promise).rejects.toThrow(
        "git commit --amend exited with code 7",
      );
    });
  });

  describe("guessScopeFromFiles", () => {
    it("returns undefined when there are no staged files", async () => {
      mockExecFileOnce(""); // staged
      mockExecFileOnce(""); // unstaged fallback
      const scope = await guessScopeFromFiles("/repo");
      expect(scope).toBeUndefined();
    });

    it("returns the top-level directory with the most changed files", async () => {
      mockExecFileOnce(
        ["src/a.ts", "src/b.ts", "docs/readme.md"].join("\n") + "\n",
      );
      const scope = await guessScopeFromFiles("/repo");
      expect(scope).toBe("src");
    });

    it("uses the filename base (without extension) for top-level files", async () => {
      mockExecFileOnce(["package.json"].join("\n") + "\n");
      const scope = await guessScopeFromFiles("/repo");
      expect(scope).toBe("package");
    });
  });

  describe("detectIssueFromBranchName", () => {
    it("returns undefined for an undefined branch", () => {
      expect(detectIssueFromBranchName(undefined)).toBeUndefined();
    });

    it("detects a JIRA-style issue key", () => {
      expect(detectIssueFromBranchName("feature/JIRA-123-do-thing")).toBe(
        "JIRA-123",
      );
    });

    it("detects a bare numeric issue number (2+ digits)", () => {
      expect(detectIssueFromBranchName("feature/456-something")).toBe("456");
    });

    it("returns undefined when there is no recognizable issue pattern", () => {
      expect(detectIssueFromBranchName("main")).toBeUndefined();
    });

    it("does not match a single digit", () => {
      expect(detectIssueFromBranchName("v1")).toBeUndefined();
    });
  });

  describe("pickRepository / getRepositoryByIndex", () => {
    const repoA = { rootUri: { fsPath: "/a" } } as unknown as GitApiRepository;
    const repoB = { rootUri: { fsPath: "/b" } } as unknown as GitApiRepository;

    it("pickRepository returns the first repository", () => {
      const api = { repositories: [repoA, repoB], getRepository: () => null };
      expect(pickRepository(api)).toBe(repoA);
    });

    it("pickRepository returns undefined when there are no repositories", () => {
      const api = { repositories: [], getRepository: () => null };
      expect(pickRepository(api)).toBeUndefined();
    });

    it("getRepositoryByIndex returns the repository at a valid index", () => {
      const api = { repositories: [repoA, repoB], getRepository: () => null };
      expect(getRepositoryByIndex(api, 1)).toBe(repoB);
    });

    it("getRepositoryByIndex returns undefined for an out-of-range index", () => {
      const api = { repositories: [repoA, repoB], getRepository: () => null };
      expect(getRepositoryByIndex(api, 5)).toBeUndefined();
      expect(getRepositoryByIndex(api, -1)).toBeUndefined();
    });
  });

  describe("getRepoInfo", () => {
    it("returns name (last path segment), branch, and staged file count", async () => {
      mockExecFileOnce("develop\n"); // rev-parse --abbrev-ref HEAD
      mockExecFileOnce("a.ts\nb.ts\nc.ts\n"); // diff --staged --name-only

      const info = await getRepoInfo("/home/user/my-repo");
      expect(info).toEqual({
        name: "my-repo",
        branch: "develop",
        stagedCount: 3,
      });
    });

    it("falls back to 'detached' and stagedCount 0 when git commands fail", async () => {
      mockExecFileOnce("", new Error("fail")); // branch lookup fails
      mockExecFileOnce("", new Error("fail")); // staged files lookup fails

      const info = await getRepoInfo("/home/user/my-repo");
      expect(info).toEqual({
        name: "my-repo",
        branch: "detached",
        stagedCount: 0,
      });
    });

    it("falls back to 'unknown' when cwd has no path segments", async () => {
      mockExecFileOnce("main\n");
      mockExecFileOnce("");
      const info = await getRepoInfo("");
      expect(info.name).toBe("unknown");
    });
  });

  describe("getGitApi / activateGitExtension", () => {
    it("getGitApi returns undefined when the vscode.git extension is not installed", () => {
      expect(getGitApi()).toBeUndefined();
    });

    it("getGitApi returns undefined when the extension is not active", () => {
      __mockState.extensions.set("vscode.git", { isActive: false });
      expect(getGitApi()).toBeUndefined();
    });

    it("getGitApi returns the API when active and exports.getAPI succeeds", () => {
      const fakeApi = { repositories: [], getRepository: () => null };
      __mockState.extensions.set("vscode.git", {
        isActive: true,
        exports: { getAPI: () => fakeApi },
      });
      expect(getGitApi()).toBe(fakeApi);
    });

    it("getGitApi returns undefined if exports.getAPI throws", () => {
      __mockState.extensions.set("vscode.git", {
        isActive: true,
        exports: {
          getAPI: () => {
            throw new Error("nope");
          },
        },
      });
      expect(getGitApi()).toBeUndefined();
    });

    it("activateGitExtension returns undefined when the extension is missing", async () => {
      await expect(activateGitExtension()).resolves.toBeUndefined();
    });

    it("activateGitExtension activates an inactive extension then returns the API", async () => {
      const fakeApi = { repositories: [], getRepository: () => null };
      const activate = jest.fn().mockResolvedValue(undefined);
      __mockState.extensions.set("vscode.git", {
        isActive: false,
        activate,
        exports: { getAPI: () => fakeApi },
      });
      const api = await activateGitExtension();
      expect(activate).toHaveBeenCalled();
      expect(api).toBe(fakeApi);
    });

    it("activateGitExtension does not re-activate an already-active extension", async () => {
      const fakeApi = { repositories: [], getRepository: () => null };
      const activate = jest.fn();
      __mockState.extensions.set("vscode.git", {
        isActive: true,
        activate,
        exports: { getAPI: () => fakeApi },
      });
      const api = await activateGitExtension();
      expect(activate).not.toHaveBeenCalled();
      expect(api).toBe(fakeApi);
    });
  });
});
