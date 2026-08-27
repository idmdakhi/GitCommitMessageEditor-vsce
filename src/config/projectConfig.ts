import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import { PortableConfig } from "./types";

/**
 * Project-level config committed in the repo so the whole team shares one template/settings.
 * Supported filenames (priority order):
 *   .commit-message-editor.json
 *   .commit-message-editor.yaml
 *   .commit-message-editor.yml
 *
 * The optional "template" key fully replaces the form structure when present.
 * Without "template", only types/scopes/maxSubjectLength/... override extension settings.
 */
export interface ProjectConfigFile {
  name?: string;
  types?: string[];
  scopes?: string[];
  maxSubjectLength?: number;
  maxLineLength?: number;
  autoFillSignedOffBy?: boolean;
  detectIssueFromBranch?: boolean;
  emojiPrefix?: boolean;
  template?: {
    template?: string[];
    tokens: PortableConfig["tokens"];
  };
}

export interface LoadedProjectConfig {
  filePath: string;
  fileName: string;
  data: ProjectConfigFile;
}

const PROJECT_CONFIG_FILENAMES = [
  ".commit-message-editor.json",
  ".commit-message-editor.yaml",
  ".commit-message-editor.yml",
];

export function findProjectConfigFile(cwd: string): string | undefined {
  for (const name of PROJECT_CONFIG_FILENAMES) {
    const full = path.join(cwd, name);
    if (fs.existsSync(full)) {
      return full;
    }
  }
  return undefined;
}

export function loadProjectConfig(
  cwd: string,
): LoadedProjectConfig | undefined {
  const filePath = findProjectConfigFile(cwd);
  if (!filePath) {
    return undefined;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const fileName = path.basename(filePath);
  let data: ProjectConfigFile;
  try {
    data = fileName.endsWith(".json") ? JSON.parse(raw) : parseYaml(raw);
  } catch (e: any) {
    throw new Error(`Parse error in ${fileName}: ${e.message ?? e}`);
  }
  return { filePath, fileName, data: data || {} };
}

export function projectConfigToPortableConfig(
  name: string,
  project: ProjectConfigFile,
): PortableConfig | undefined {
  if (!project.template) {
    return undefined;
  }
  return {
    configVersion: "1",
    name: project.name || name,
    template: project.template.template as string[],
    tokens: project.template.tokens,
  };
}

/** Starter sample that demonstrates each token capability so teams can copy/edit their own template. */
export function starterProjectConfigJson(): string {
  const sample = {
    name: "Team convention (sample — edit me)",
    autoFillSignedOffBy: false,
    detectIssueFromBranch: true,
    template: {
      template: [
        "{type}{scope}{subject}",
        "",
        "{body}",
        "",
        "{breakingChange}",
        "{closes}",
        "{contributors}",
        "{needsReview}",
      ],
      tokens: [
        {
          label: "Type",
          name: "type",
          type: "enum",
          required: true,
          description: "Select the change type",
          options: [
            { label: "feat", description: "New feature" },
            { label: "fix", description: "Bug fix" },
            { label: "chore", description: "Maintenance / tooling" },
          ],
        },
        {
          label: "Scope",
          name: "scope",
          type: "text",
          description: "Area of the codebase affected (optional)",
          prefix: "(",
          suffix: ")",
        },
        {
          label: "Subject",
          name: "subject",
          type: "text",
          required: true,
          description: "Short summary in imperative mood",
          maxLength: 72,
          prefix: ": ",
        },
        {
          label: "Body",
          name: "body",
          type: "text",
          multiline: true,
          lines: 4,
          maxLineLength: 100,
          description: "Full description of the changes and why",
        },
        {
          label: "BREAKING CHANGE",
          name: "breakingChange",
          type: "text",
          multiline: true,
          conditional: true,
          prefix: "BREAKING CHANGE: ",
          description: "Describe the incompatible change",
        },
        {
          label: "Closes",
          name: "closes",
          type: "text",
          prefix: "Closes: ",
          issueList: true,
          description: "Issue numbers closed by this commit, comma-separated",
        },
        {
          label: "Co-authored-by",
          name: "contributors",
          type: "text",
          multiline: true,
          perLine: true,
          prefix: "Co-authored-by: ",
          description: "One person per line: Name <email>",
        },
        {
          label: "Needs careful review",
          name: "needsReview",
          type: "boolean",
          value: "Needs-careful-review: true",
          description:
            "When checked, the line above is inserted into the message",
        },
      ],
    },
  };
  return JSON.stringify(sample, null, 2) + "\n";
}
