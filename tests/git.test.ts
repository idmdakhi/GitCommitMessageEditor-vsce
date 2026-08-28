import * as cp from "child_process";
import sinon from "sinon";
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
  getRepoInfo,
} from "../src/utils/git";

describe("Git Utilities", () => {
  let execFileStub: sinon.SinonStub;

  beforeEach(() => {
    execFileStub = sinon.stub(cp, "execFile");
  });

  afterEach(() => {
    execFileStub.restore();
  });

  describe("execGit", () => {
    it("should resolve with stdout on success", async () => {
      execFileStub.yields(null, "output\n");
      const result = await execGit(["config", "user.name"], "/test");
      expect(result).toBe("output\n");
    });

    it("should reject with error on failure", async () => {
      const error = new Error("git error");
      execFileStub.yields(error, "");
      await expect(execGit(["invalid"], "/test")).rejects.toThrow("git error");
    });
  });

  describe("getUserIdentity", () => {
    it("should return user identity when both name and email are set", async () => {
      execFileStub
        .onFirstCall()
        .yields(null, "John Doe\n")
        .onSecondCall()
        .yields(null, "john@example.com\n");
      const result = await getUserIdentity("/test");
      expect(result).toEqual({ name: "John Doe", email: "john@example.com" });
    });

    it("should return undefined if git config fails", async () => {
      execFileStub.yields(new Error("config not found"), "");
      const result = await getUserIdentity("/test");
      expect(result).toBeUndefined();
    });

    it("should return undefined if name and email are empty", async () => {
      execFileStub
        .onFirstCall()
        .yields(null, "")
        .onSecondCall()
        .yields(null, "");
      const result = await getUserIdentity("/test");
      expect(result).toBeUndefined();
    });
  });

  describe("getCurrentBranch", () => {
    it("should return branch name on success", async () => {
      execFileStub.yields(null, "main\n");
      const result = await getCurrentBranch("/test");
      expect(result).toBe("main");
    });

    it("should return undefined on failure", async () => {
      execFileStub.yields(new Error("not a git repo"), "");
      const result = await getCurrentBranch("/test");
      expect(result).toBeUndefined();
    });
  });

  describe("getStagedFiles", () => {
    it("should return list of staged files", async () => {
      execFileStub.onFirstCall().yields(null, "src/main.ts\nsrc/utils.ts\n");
      const result = await getStagedFiles("/test");
      expect(result).toEqual(["src/main.ts", "src/utils.ts"]);
    });

    it("should fallback to unstaged if no staged changes", async () => {
      execFileStub
        .onFirstCall()
        .yields(null, "")
        .onSecondCall()
        .yields(null, "README.md\n");
      const result = await getStagedFiles("/test");
      expect(result).toEqual(["README.md"]);
    });

    it("should return empty array on error", async () => {
      execFileStub.yields(new Error("git error"), "");
      const result = await getStagedFiles("/test");
      expect(result).toEqual([]);
    });
  });

  describe("getStagedDiff", () => {
    it("should return staged diff", async () => {
      const diff = "diff --git a/file b/file\n+line";
      execFileStub.onFirstCall().yields(null, diff);
      const result = await getStagedDiff("/test");
      expect(result).toBe(diff);
    });

    it("should fallback to unstaged diff if staged is empty", async () => {
      const diff = "unstaged diff";
      execFileStub
        .onFirstCall()
        .yields(null, "")
        .onSecondCall()
        .yields(null, diff);
      const result = await getStagedDiff("/test");
      expect(result).toBe(diff);
    });

    it("should return empty string on error", async () => {
      execFileStub.yields(new Error("git error"), "");
      const result = await getStagedDiff("/test");
      expect(result).toBe("");
    });
  });

  describe("getRecentCommits", () => {
    it("should parse commit log correctly", async () => {
      const log =
        "abc123\u0001feat: add feature\u0001body line 1\u0002" +
        "def456\u0001fix: bug fix\u0001\u0002";
      execFileStub.yields(null, log);
      const result = await getRecentCommits("/test", 2);
      expect(result).toEqual([
        { hash: "abc123", subject: "feat: add feature", body: "body line 1" },
        { hash: "def456", subject: "fix: bug fix", body: "" },
      ]);
    });

    it("should return empty array on error", async () => {
      execFileStub.yields(new Error("git error"), "");
      const result = await getRecentCommits("/test", 10);
      expect(result).toEqual([]);
    });
  });

  describe("getLastCommitMessage", () => {
    it("should return last commit message without trailing newline", async () => {
      execFileStub.yields(null, "feat: add feature\n\nbody line\n");
      const result = await getLastCommitMessage("/test");
      expect(result).toBe("feat: add feature\n\nbody line");
    });

    it("should return empty string on error", async () => {
      execFileStub.yields(new Error("git error"), "");
      const result = await getLastCommitMessage("/test");
      expect(result).toBe("");
    });
  });

  describe("amendLastCommit", () => {
    let spawnStub: sinon.SinonStub;

    beforeEach(() => {
      spawnStub = sinon.stub(cp, "spawn");
    });

    afterEach(() => {
      spawnStub.restore();
    });

    it("should resolve on successful amend", async () => {
      const mockChild = {
        stdin: { write: sinon.stub(), end: sinon.stub() },
        stderr: { on: sinon.stub() },
        on: sinon.stub().callsFake((event, cb) => {
          if (event === "close") cb(0);
        }),
      };
      spawnStub.returns(mockChild);
      await expect(
        amendLastCommit("/test", "new message"),
      ).resolves.toBeUndefined();
    });

    it("should reject on failed amend", async () => {
      const mockChild = {
        stdin: { write: sinon.stub(), end: sinon.stub() },
        stderr: {
          on: sinon.stub().callsFake((event, cb) => {
            if (event === "data") cb("error message");
          }),
        },
        on: sinon.stub().callsFake((event, cb) => {
          if (event === "close") cb(1);
        }),
      };
      spawnStub.returns(mockChild);
      await expect(amendLastCommit("/test", "new message")).rejects.toThrow(
        "error message",
      );
    });
  });

  describe("guessScopeFromFiles", () => {
    it("should return the most common top-level directory", async () => {
      const files = ["src/main.ts", "src/utils.ts", "tests/test.spec.ts"];
      execFileStub.yields(null, files.join("\n"));
      const result = await guessScopeFromFiles("/test");
      expect(result).toBe("src"); // 'src' appears twice, 'tests' once
    });

    it("should return first part of file name if no directory", async () => {
      execFileStub.yields(null, "README.md\nLICENSE\n");
      const result = await guessScopeFromFiles("/test");
      expect(result).toBe("README"); // because no '/' so it takes first part of first file
    });

    it("should return undefined if no staged files", async () => {
      execFileStub.yields(null, "");
      const result = await guessScopeFromFiles("/test");
      expect(result).toBeUndefined();
    });
  });

  describe("detectIssueFromBranchName", () => {
    it("should extract JIRA-style issue", () => {
      expect(detectIssueFromBranchName("feature/JIRA-123")).toBe("JIRA-123");
      expect(detectIssueFromBranchName("fix/PROJECT-456")).toBe("PROJECT-456");
    });

    it("should extract numeric issue", () => {
      expect(detectIssueFromBranchName("feature/123")).toBe("123");
      expect(detectIssueFromBranchName("bugfix/4567")).toBe("4567");
    });

    it("should return undefined if no issue found", () => {
      expect(detectIssueFromBranchName("main")).toBeUndefined();
      expect(detectIssueFromBranchName("")).toBeUndefined();
      expect(detectIssueFromBranchName(undefined)).toBeUndefined();
    });
  });

  describe("getRepoInfo", () => {
    it("should return repository info", async () => {
      execFileStub
        .onFirstCall()
        .yields(null, "main\n")
        .onSecondCall()
        .yields(null, "file1.ts\nfile2.ts\n");
      const result = await getRepoInfo("/path/to/repo");
      expect(result).toEqual({
        name: "repo",
        branch: "main",
        stagedCount: 2,
      });
    });

    it("should handle errors gracefully", async () => {
      execFileStub.yields(new Error("git error"), "");
      const result = await getRepoInfo("/path");
      expect(result).toEqual({
        name: "path",
        branch: "detached",
        stagedCount: 0,
      });
    });
  });
});
