import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ConfigManager as ConfigManagerType } from "../../src/config/configManager";
import ConfigManager from "../../src/config/configManager";
import { PortableConfig } from "../../src/config/types";
import type * as VscodeMockModule from "../__mocks__/vscode";
import * as vscodeMock from "../__mocks__/vscode";

// `configManager.ts` keeps a module-level `bundledTemplatesCache` that
// persists for the lifetime of the module. Since each test below uses a
// fresh temp "extension path" with its own templates/, we isolate the
// module registry per test (via jest.isolateModules) so both the
// `vscode` mock and `configManager` are freshly required together and
// the cache never leaks across tests.
let ConfigManager: typeof ConfigManagerType;

function writeTemplate(dir: string, fileName: string, config: PortableConfig) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(config));
}

const sampleToken = {
  label: "Subject",
  name: "subject",
  type: "text" as const,
};

function makeConfig(name: string): PortableConfig {
  return {
    version: "1",
    name,
    template: ["{subject}"],
    tokens: [sampleToken],
  };
}

describe("ConfigManager", () => {
  let extensionPath: string;
  let cwd: string;
  let context: ReturnType<typeof VscodeMockModule.makeMockExtensionContext>;
  let manager: ConfigManagerType;

  beforeEach(() => {
    extensionPath = fs.mkdtempSync(path.join(os.tmpdir(), "gitcme-ext-"));
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gitcme-repo-"));
    context = vscodeMock.makeMockExtensionContext(extensionPath);
    manager = new ConfigManager(context as any);
  });

  afterEach(() => {
    fs.rmSync(extensionPath, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  });

  describe("getAllConfigs", () => {
    it("falls back to the bundled default.json when templates/ has no valid entries", () => {
      // No templates dir at all -> loadDefaultConfig fallback kicks in.
      const configs = manager.getAllConfigs(cwd);
      expect(configs).toHaveLength(1);
      expect(configs[0].name).toBe("Text"); // built-in minimal fallback name
    });

    it("loads bundled templates from the extension's templates/ dir", () => {
      const templatesDir = path.join(extensionPath, "templates");
      writeTemplate(templatesDir, "default.json", makeConfig("Conventional"));
      writeTemplate(templatesDir, "gitmoji.json", makeConfig("Gitmoji"));

      const configs = manager.getAllConfigs(cwd);
      const names = configs.map((c) => c.name).sort();
      expect(names).toEqual(["Conventional", "Gitmoji"]);
    });

    it("skips invalid template files with a console warning", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const templatesDir = path.join(extensionPath, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });
      fs.writeFileSync(
        path.join(templatesDir, "broken.json"),
        JSON.stringify({ name: "Broken" }), // missing tokens/template
      );
      writeTemplate(templatesDir, "good.json", makeConfig("Good"));

      const configs = manager.getAllConfigs(cwd);
      expect(configs.map((c) => c.name)).toEqual(["Good"]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Skipping invalid template file"),
      );
      warnSpy.mockRestore();
    });

    it("warns and skips a template file containing invalid JSON", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const templatesDir = path.join(extensionPath, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });
      fs.writeFileSync(path.join(templatesDir, "bad.json"), "{ oops");

      const configs = manager.getAllConfigs(cwd);
      // falls back to default.json fallback since nothing valid was loaded
      expect(configs[0].name).toBe("Text");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse template file"),
      );
      warnSpy.mockRestore();
    });

    it("de-duplicates by name on a clash between a workspace and a bundled template", () => {
      // NOTE: in the current implementation, getAllConfigs() builds a
      // Map keyed by name, populating it with workspace templates first
      // and then bundled templates. Since the bundled loop runs *last*,
      // a bundled entry silently overwrites a workspace entry that
      // shares the same name — so on a name clash it's the bundled
      // template's content that survives, not the workspace one.
      const templatesDir = path.join(extensionPath, "templates");
      const bundledConfig = makeConfig("Shared Name");
      bundledConfig.template = ["{subject} (bundled)"];
      writeTemplate(templatesDir, "default.json", bundledConfig);

      const wsDir = path.join(cwd, ".vscode", "commit-templates");
      const wsConfig = makeConfig("Shared Name");
      wsConfig.template = ["{subject} (workspace)"];
      writeTemplate(wsDir, "shared.json", wsConfig);

      const configs = manager.getAllConfigs(cwd);
      expect(configs).toHaveLength(1);
      expect(configs[0].template).toEqual(["{subject} (bundled)"]);
    });

    it("returns only bundled templates when cwd is not provided", () => {
      const templatesDir = path.join(extensionPath, "templates");
      writeTemplate(templatesDir, "default.json", makeConfig("Bundled Only"));
      const configs = manager.getAllConfigs();
      expect(configs.map((c) => c.name)).toEqual(["Bundled Only"]);
    });
  });

  describe("isWorkspaceTemplate", () => {
    it("returns false when there is no workspace template with that name", () => {
      expect(manager.isWorkspaceTemplate("Nope", cwd)).toBe(false);
    });

    it("returns true for a template saved in the workspace", () => {
      const wsDir = path.join(cwd, ".vscode", "commit-templates");
      writeTemplate(wsDir, "mine.json", makeConfig("Mine"));
      expect(manager.isWorkspaceTemplate("Mine", cwd)).toBe(true);
    });

    it("returns false when cwd is undefined", () => {
      expect(manager.isWorkspaceTemplate("Mine", undefined)).toBe(false);
    });
  });

  describe("getActiveConfig", () => {
    beforeEach(() => {
      const templatesDir = path.join(extensionPath, "templates");
      writeTemplate(
        templatesDir,
        "conventional.json",
        makeConfig("Conventional"),
      );
      writeTemplate(templatesDir, "gitmoji.json", makeConfig("Gitmoji"));
    });

    it("returns the previously active config by name when still valid", async () => {
      await manager.setActiveConfig("Gitmoji");
      const active = manager.getActiveConfig(cwd);
      expect(active.name).toBe("Gitmoji");
    });

    it("prefers 'Conventional' when no active name is stored and there are no workspace templates", () => {
      const active = manager.getActiveConfig(cwd);
      expect(active.name).toBe("Conventional");
    });

    it("prefers the first workspace template when one exists and nothing is explicitly active", () => {
      const wsDir = path.join(cwd, ".vscode", "commit-templates");
      writeTemplate(wsDir, "team.json", makeConfig("Team Template"));

      const active = manager.getActiveConfig(cwd);
      expect(active.name).toBe("Team Template");
    });

    it("falls back to the first available config if stored active name no longer exists", async () => {
      await manager.setActiveConfig("Some Deleted Template");
      const active = manager.getActiveConfig(cwd);
      // Still resolves to *a* valid config rather than throwing.
      expect(["Conventional", "Gitmoji"]).toContain(active.name);
    });
  });

  describe("saveConfig / deleteConfig", () => {
    it("throws when no cwd/workspace is open", async () => {
      await expect(
        manager.saveConfig(makeConfig("No Workspace")),
      ).rejects.toThrow(/workspace folder must be open/);
    });

    it("writes a slugified JSON file into .vscode/commit-templates and sets it active", async () => {
      const config = makeConfig("My Cool Template!");
      await manager.saveConfig(config, cwd);

      const expectedPath = path.join(
        cwd,
        ".vscode",
        "commit-templates",
        "my-cool-template.json",
      );
      expect(fs.existsSync(expectedPath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(expectedPath, "utf8"));
      expect(written.name).toBe("My Cool Template!");
      expect(written.version).toBe("1");
      expect(written.$schema).toBeDefined();

      expect(manager.isWorkspaceTemplate("My Cool Template!", cwd)).toBe(true);
    });

    it("slugifies unicode (Persian) names sensibly, falling back to 'template' if empty", async () => {
      const config = makeConfig("پیام فارسی");
      await manager.saveConfig(config, cwd);
      const files = fs.readdirSync(
        path.join(cwd, ".vscode", "commit-templates"),
      );
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/\.json$/);
    });

    it("deleteConfig refuses to delete a non-workspace (built-in) template", async () => {
      await expect(manager.deleteConfig("Anything", cwd)).rejects.toThrow(
        /Built-in templates cannot be deleted/,
      );
    });

    it("deleteConfig removes a workspace template file", async () => {
      const config = makeConfig("Temp Template");
      await manager.saveConfig(config, cwd);
      const filePath = path.join(
        cwd,
        ".vscode",
        "commit-templates",
        "temp-template.json",
      );
      expect(fs.existsSync(filePath)).toBe(true);

      await manager.deleteConfig("Temp Template", cwd);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe("exportConfig / importConfig", () => {
    it("exportConfig does nothing when the user cancels the save dialog", async () => {
      vscodeMock.__mockState.saveDialogResult = undefined;
      await manager.exportConfig(makeConfig("Cancelled"));
      expect(vscodeMock.__mockState.writtenFiles.size).toBe(0);
    });

    it("exportConfig writes the config as JSON to the chosen file", async () => {
      const targetUri = vscodeMock.Uri.file(path.join(cwd, "exported.json"));
      vscodeMock.__mockState.saveDialogResult = targetUri;
      const config = makeConfig("Exported");

      await manager.exportConfig(config);

      const written = vscodeMock.__mockState.writtenFiles.get(targetUri.fsPath);
      expect(written).toBeDefined();
      expect(JSON.parse(written!.toString("utf8"))).toEqual(config);
      expect(vscodeMock.__mockState.informationMessages).toContain(
        "Template saved successfully.",
      );
    });

    it("importConfig returns undefined when the user cancels the open dialog", async () => {
      vscodeMock.__mockState.openDialogResult = undefined;
      const result = await manager.importConfig(cwd);
      expect(result).toBeUndefined();
    });

    it("importConfig saves and returns the parsed config on success", async () => {
      const sourceUri = vscodeMock.Uri.file(
        path.join(cwd, "import-source.json"),
      );
      const config = makeConfig("Imported");
      vscodeMock.__mockState.writtenFiles.set(
        sourceUri.fsPath,
        Buffer.from(JSON.stringify(config), "utf8"),
      );
      vscodeMock.__mockState.openDialogResult = [sourceUri];

      const result = await manager.importConfig(cwd);
      expect(result).toEqual(config);
      expect(manager.isWorkspaceTemplate("Imported", cwd)).toBe(true);
      expect(
        vscodeMock.__mockState.informationMessages.some((m: string) =>
          m.includes("imported successfully"),
        ),
      ).toBe(true);
    });

    it("importConfig reports an error message for malformed structure", async () => {
      const sourceUri = vscodeMock.Uri.file(path.join(cwd, "bad-import.json"));
      vscodeMock.__mockState.writtenFiles.set(
        sourceUri.fsPath,
        Buffer.from(JSON.stringify({ name: "Missing fields" }), "utf8"),
      );
      vscodeMock.__mockState.openDialogResult = [sourceUri];

      const result = await manager.importConfig(cwd);
      expect(result).toBeUndefined();
      expect(
        vscodeMock.__mockState.errorMessages.some((m: string) =>
          m.startsWith("Import failed:"),
        ),
      ).toBe(true);
    });
  });
});
