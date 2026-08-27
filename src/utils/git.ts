import * as vscode from "vscode";
import * as cp from "child_process";

// Uses the official VS Code Git Extension API (no external deps).

export interface GitApiRepository {
  rootUri: vscode.Uri;
  inputBox: { value: string };
  state: {
    HEAD?: { name?: string; commit?: string };
  };
}

interface GitExtensionApi {
  repositories: GitApiRepository[];
  getRepository(uri: vscode.Uri): GitApiRepository | null;
}

export function getGitApi(): GitExtensionApi | undefined {
  const ext = vscode.extensions.getExtension("vscode.git");
  if (!ext) {
    return undefined;
  }
  const exports = ext.isActive ? ext.exports : undefined;
  if (!exports) {
    return undefined;
  }
  try {
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

export async function activateGitExtension(): Promise<
  GitExtensionApi | undefined
> {
  const ext = vscode.extensions.getExtension("vscode.git");
  if (!ext) {
    return undefined;
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  try {
    return ext.exports.getAPI(1);
  } catch {
    return undefined;
  }
}

export function pickRepository(
  api: GitExtensionApi,
): GitApiRepository | undefined {
  if (!api.repositories || api.repositories.length === 0) {
    return undefined;
  }
  return api.repositories[0];
}

export function execGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile("git", args, { cwd }, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stdout.toString());
    });
  });
}

export async function getUserIdentity(
  cwd: string,
): Promise<{ name: string; email: string } | undefined> {
  try {
    const name = (await execGit(["config", "user.name"], cwd)).trim();
    const email = (await execGit(["config", "user.email"], cwd)).trim();
    if (!name && !email) {
      return undefined;
    }
    return { name, email };
  } catch {
    return undefined;
  }
}

export async function getCurrentBranch(
  cwd: string,
): Promise<string | undefined> {
  try {
    const branch = (
      await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
    ).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

export async function getStagedFiles(cwd: string): Promise<string[]> {
  try {
    let out = (await execGit(["diff", "--staged", "--name-only"], cwd)).trim();
    if (!out) {
      out = (await execGit(["diff", "--name-only"], cwd)).trim();
    }
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function getStagedDiff(cwd: string): Promise<string> {
  try {
    let diff = await execGit(["diff", "--staged"], cwd);
    if (!diff.trim()) {
      diff = await execGit(["diff"], cwd);
    }
    return diff;
  } catch {
    return "";
  }
}

export async function getRecentCommits(
  cwd: string,
  maxItems: number,
): Promise<{ hash: string; subject: string; body: string }[]> {
  try {
    const sep = "\u0001";
    const rec = "\u0002";
    const raw = await execGit(
      ["log", `-n${maxItems}`, `--pretty=format:%H${sep}%s${sep}%b${rec}`],
      cwd,
    );
    return raw
      .split(rec)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [hash, subject, body] = chunk.split(sep);
        return {
          hash: hash ?? "",
          subject: subject ?? "",
          body: (body ?? "").trim(),
        };
      });
  } catch {
    return [];
  }
}

export async function getLastCommitMessage(cwd: string): Promise<string> {
  try {
    return (await execGit(["log", "-1", "--pretty=%B"], cwd)).replace(
      /\n+$/,
      "",
    );
  } catch {
    return "";
  }
}

export async function amendLastCommit(
  cwd: string,
  newMessage: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = cp.spawn("git", ["commit", "--amend", "-F", "-"], { cwd });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(stderr || `git commit --amend exited with code ${code}`),
        );
      }
    });
    child.stdin.write(newMessage);
    child.stdin.end();
  });
}

export async function guessScopeFromFiles(
  cwd: string,
): Promise<string | undefined> {
  const files = await getStagedFiles(cwd);
  if (files.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const f of files) {
    const parts = f.split("/");
    const top = parts.length > 1 ? parts[0] : parts[0].split(".")[0];
    counts.set(top, (counts.get(top) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [k, v] of counts) {
    if (v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}

export function detectIssueFromBranchName(
  branch: string | undefined,
): string | undefined {
  if (!branch) {
    return undefined;
  }
  const match = branch.match(/([A-Za-z][A-Za-z0-9]+-\d+)|(\d{2,})/);
  return match ? match[0] : undefined;
}

export function getRepositoryByIndex(
  api: GitExtensionApi,
  index: number,
): GitApiRepository | undefined {
  if (!api.repositories || index < 0 || index >= api.repositories.length) {
    return undefined;
  }
  return api.repositories[index];
}

export async function getRepoInfo(
  cwd: string,
): Promise<{ name: string; branch: string; stagedCount: number }> {
  const name = cwd.split(/[\\/]/).pop() || "unknown";
  let branch = "detached";
  try {
    const out = await execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    branch = out.trim() || "detached";
  } catch {}
  let stagedCount = 0;
  try {
    const out = await execGit(["diff", "--staged", "--name-only"], cwd);
    stagedCount = out ? out.split("\n").filter(Boolean).length : 0;
  } catch {}
  return { name, branch, stagedCount };
}
