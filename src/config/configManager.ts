import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { PortableConfig } from "./types";
import { loadDefaultConfig } from "./defaultConfig";

const ACTIVE_KEY = "gitCommitMessageEditor.activeConfigName";

const WORKSPACE_TEMPLATES_DIR = path.join(".vscode", "commit-templates");
const BUNDLED_TEMPLATES_DIR = "templates";

let bundledTemplatesCache: PortableConfig[] | undefined;

function isValidPortableConfig(value: any): value is PortableConfig {
  return (
    value &&
    typeof value === "object" &&
    typeof value.name === "string" &&
    value.name.trim() !== "" &&
    Array.isArray(value.tokens) &&
    value.tokens.length > 0 &&
    Array.isArray(value.template) &&
    value.template.length > 0
  );
}

function readTemplatesFromDir(dir: string): PortableConfig[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: PortableConfig[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (isValidPortableConfig(parsed)) {
        results.push({
          configVersion: "1",
          name: parsed.name,
          template: parsed.template,
          tokens: parsed.tokens,
        });
      } else {
        console.warn(
          `[GitCommitMessageEditor-vsce] Skipping invalid template file: ${filePath}`,
        );
      }
    } catch (e: any) {
      console.warn(
        `[GitCommitMessageEditor-vsce] Failed to parse template file ${filePath}: ${e.message ?? e}`,
      );
    }
  }
  return results;
}

function slugifyTemplateName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "template";
}

export class ConfigManager {
  private extensionPath: string;

  constructor(private context: vscode.ExtensionContext) {
    this.extensionPath = context.extensionPath;
  }

  private loadBundledTemplates(): PortableConfig[] {
    if (bundledTemplatesCache) {
      return bundledTemplatesCache;
    }
    const dir = path.join(this.extensionPath, BUNDLED_TEMPLATES_DIR);
    const loaded = readTemplatesFromDir(dir);
    if (loaded.length === 0) {
      // اگر هیچ فایلی در templates نبود، از default.json استفاده کن
      const fallback = loadDefaultConfig(this.extensionPath);
      bundledTemplatesCache = [fallback];
      return bundledTemplatesCache;
    }
    bundledTemplatesCache = loaded;
    return loaded;
  }

  private loadWorkspaceTemplates(cwd: string | undefined): PortableConfig[] {
    if (!cwd) return [];
    return readTemplatesFromDir(path.join(cwd, WORKSPACE_TEMPLATES_DIR));
  }

  private workspaceTemplatesDirFor(cwd: string): string {
    return path.join(cwd, WORKSPACE_TEMPLATES_DIR);
  }

  getAllConfigs(cwd?: string): PortableConfig[] {
    const bundled = this.loadBundledTemplates();
    const workspaceTemplates = this.loadWorkspaceTemplates(cwd);

    const byName = new Map<string, PortableConfig>();
    for (const c of workspaceTemplates) {
      byName.set(c.name, c);
    }
    for (const c of bundled) {
      byName.set(c.name, c);
    }
    return Array.from(byName.values());
  }

  isWorkspaceTemplate(name: string, cwd?: string): boolean {
    return this.loadWorkspaceTemplates(cwd).some((c) => c.name === name);
  }

  getActiveConfig(cwd?: string): PortableConfig {
    const all = this.getAllConfigs(cwd);
    const workspaceTemplates = this.loadWorkspaceTemplates(cwd);
    const activeName = this.context.workspaceState.get<string>(ACTIVE_KEY);

    // ۱. اگر نام فعال معتبر است، همان را برگردان
    if (activeName) {
      const found = all.find((c) => c.name === activeName);
      if (found) return found;
    }

    // ۲. اگر حداقل یک قالب در مخزن وجود دارد، اولین آن را انتخاب کن
    if (workspaceTemplates.length > 0) {
      // اولین قالب workspace (چون در getAllConfigs ابتدا workspace‌ها درج شده‌اند)
      return all[0];
    }

    // ۳. هیچ قالب مخزنی وجود ندارد:
    //    اولویت با قالب built-in با نام "Conventional" یا "Conventional Commits" است
    const conventional = all.find(
      (c) => c.name === "Conventional" || c.name === "Conventional Commits",
    );
    if (conventional) return conventional;

    // ۴. در غیر این صورت اولین قالب built-in موجود (یا fallback)
    if (all.length > 0) return all[0];
    return loadDefaultConfig(this.extensionPath);
  }

  async setActiveConfig(name: string) {
    await this.context.workspaceState.update(ACTIVE_KEY, name);
  }

  async saveConfig(config: PortableConfig, cwd?: string) {
    if (!cwd) {
      throw new Error(
        "No open repository/workspace — templates are saved into .vscode/commit-templates in the repo, so a workspace folder must be open first.",
      );
    }
    const dir = this.workspaceTemplatesDirFor(cwd);
    fs.mkdirSync(dir, { recursive: true });

    const fileName = `${slugifyTemplateName(config.name)}.json`;
    const filePath = path.join(dir, fileName);

    const schemaAbsPath = path.join(
      this.extensionPath,
      "schemas",
      "v1-template.schema.json",
    );
    const schemaRelPath = path
      .relative(dir, schemaAbsPath)
      .split(path.sep)
      .join("/");

    const toWrite: Record<string, unknown> = {
      $schema: schemaRelPath,
      configVersion: "1",
      name: config.name,
      template: config.template,
      tokens: config.tokens,
    };

    fs.writeFileSync(filePath, JSON.stringify(toWrite, null, 2) + "\n", "utf8");

    await this.setActiveConfig(config.name);
  }

  async deleteConfig(name: string, cwd?: string) {
    if (!cwd || !this.isWorkspaceTemplate(name, cwd)) {
      throw new Error(
        "Built-in templates cannot be deleted. Only templates saved in this repo's .vscode/commit-templates can be removed.",
      );
    }
    const dir = this.workspaceTemplatesDirFor(cwd);
    const fileName = `${slugifyTemplateName(name)}.json`;
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const active = this.context.workspaceState.get<string>(ACTIVE_KEY);
    if (active === name) {
      // به قالب پیش‌فرض برگرد
      await this.setActiveConfig(this.getActiveConfig(cwd).name);
    }
  }

  async exportConfig(config: PortableConfig) {
    const uri = await vscode.window.showSaveDialog({
      filters: { JSON: ["json"] },
      saveLabel: "Save template",
      defaultUri: vscode.Uri.file(`${slugifyTemplateName(config.name)}.json`),
    });
    if (!uri) {
      return;
    }
    const bytes = Buffer.from(JSON.stringify(config, null, 2), "utf8");
    await vscode.workspace.fs.writeFile(uri, bytes);
    vscode.window.showInformationMessage("Template saved successfully.");
  }

  async importConfig(cwd?: string): Promise<PortableConfig | undefined> {
    const uris = await vscode.window.showOpenDialog({
      filters: { JSON: ["json"] },
      canSelectMany: false,
      openLabel: "Import template",
    });
    if (!uris || uris.length === 0) {
      return undefined;
    }
    const bytes = await vscode.workspace.fs.readFile(uris[0]);
    const text = Buffer.from(bytes).toString("utf8");
    try {
      const parsed = JSON.parse(text) as PortableConfig;
      if (!parsed.tokens || !parsed.template) {
        throw new Error("Invalid file structure (tokens or template missing).");
      }
      await this.saveConfig(parsed, cwd);
      vscode.window.showInformationMessage(
        `Template “${parsed.name}” imported successfully.`,
      );
      return parsed;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Import failed: ${e.message ?? e}`);
      return undefined;
    }
  }
}
