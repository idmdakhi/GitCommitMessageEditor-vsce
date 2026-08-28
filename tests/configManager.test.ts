import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import sinon from "sinon";
import { ConfigManager } from "../src/config/configManager";
import { PortableConfig } from "../src/config/types";

// Mock fs and vscode
jest.mock("fs");
jest.mock("vscode");

describe("ConfigManager", () => {
  let context: vscode.ExtensionContext;
  let manager: ConfigManager;
  let fsStub: sinon.SinonStubbedInstance<typeof fs>;
  let workspaceStateStub: any;

  const mockConfig: PortableConfig = {
    version: "1",
    name: "Test Template",
    template: ["{type}{scope}{subject}", "", "{body}"],
    tokens: [
      {
        label: "Type",
        name: "type",
        type: "enum",
        options: [{ label: "feat" }],
      },
      { label: "Subject", name: "subject", type: "text", required: true },
    ],
  };

  beforeEach(() => {
    // Reset all stubs
    jest.resetAllMocks();

    // Mock workspaceState
    workspaceStateStub = {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    context = {
      extensionPath: "/mock/extension",
      workspaceState: workspaceStateStub,
    } as any;

    // Mock fs
    fsStub = sinon.stub(fs);
    (fs as any).existsSync = fsStub.existsSync;
    (fs as any).readdirSync = fsStub.readdirSync;
    (fs as any).readFileSync = fsStub.readFileSync;
    (fs as any).mkdirSync = fsStub.mkdirSync;
    (fs as any).writeFileSync = fsStub.writeFileSync;
    (fs as any).unlinkSync = fsStub.unlinkSync;

    manager = new ConfigManager(context);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("getAllConfigs", () => {
    it("should load bundled and workspace templates", () => {
      // Mock bundled templates
      fsStub.existsSync.withArgs("/mock/extension/templates").returns(true);
      fsStub.readdirSync
        .withArgs("/mock/extension/templates")
        .returns(["default.json"]);
      fsStub.readFileSync
        .withArgs("/mock/extension/templates/default.json", "utf8")
        .returns(JSON.stringify(mockConfig));

      // Mock workspace templates
      fsStub.existsSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(true);
      fsStub.readdirSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(["custom.json"]);
      const customConfig = { ...mockConfig, name: "Custom" };
      fsStub.readFileSync
        .withArgs("/workspace/.vscode/commit-templates/custom.json", "utf8")
        .returns(JSON.stringify(customConfig));

      const configs = manager.getAllConfigs("/workspace");
      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.name)).toContain("Test Template");
      expect(configs.map((c) => c.name)).toContain("Custom");
    });

    it("should prefer workspace templates over bundled with same name", () => {
      fsStub.existsSync.withArgs("/mock/extension/templates").returns(true);
      fsStub.readdirSync
        .withArgs("/mock/extension/templates")
        .returns(["default.json"]);
      fsStub.readFileSync
        .withArgs("/mock/extension/templates/default.json", "utf8")
        .returns(JSON.stringify(mockConfig));

      const workspaceOverride = {
        ...mockConfig,
        name: "Test Template",
        template: ["override"],
      };
      fsStub.existsSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(true);
      fsStub.readdirSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(["test-template.json"]);
      fsStub.readFileSync
        .withArgs(
          "/workspace/.vscode/commit-templates/test-template.json",
          "utf8",
        )
        .returns(JSON.stringify(workspaceOverride));

      const configs = manager.getAllConfigs("/workspace");
      expect(configs).toHaveLength(1);
      expect(configs[0].template).toEqual(["override"]);
    });
  });

  describe("getActiveConfig", () => {
    it("should return workspace template if available", () => {
      const workspaceConfig = { ...mockConfig, name: "Workspace Template" };
      fsStub.existsSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(true);
      fsStub.readdirSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(["workspace-template.json"]);
      fsStub.readFileSync
        .withArgs(
          "/workspace/.vscode/commit-templates/workspace-template.json",
          "utf8",
        )
        .returns(JSON.stringify(workspaceConfig));

      const active = manager.getActiveConfig("/workspace");
      expect(active.name).toBe("Workspace Template");
    });

    it("should fallback to conventional template if no workspace", () => {
      const conventional = { ...mockConfig, name: "Conventional Commits" };
      fsStub.existsSync.withArgs("/mock/extension/templates").returns(true);
      fsStub.readdirSync
        .withArgs("/mock/extension/templates")
        .returns(["default.json"]);
      fsStub.readFileSync
        .withArgs("/mock/extension/templates/default.json", "utf8")
        .returns(JSON.stringify(conventional));

      const active = manager.getActiveConfig("/workspace");
      expect(active.name).toBe("Conventional Commits");
    });

    it("should use saved active name if valid", () => {
      workspaceStateStub.get.mockReturnValue("Saved Template");
      const saved = { ...mockConfig, name: "Saved Template" };
      fsStub.existsSync.withArgs("/mock/extension/templates").returns(true);
      fsStub.readdirSync
        .withArgs("/mock/extension/templates")
        .returns(["saved.json"]);
      fsStub.readFileSync
        .withArgs("/mock/extension/templates/saved.json", "utf8")
        .returns(JSON.stringify(saved));

      const active = manager.getActiveConfig("/workspace");
      expect(active.name).toBe("Saved Template");
    });
  });

  describe("saveConfig", () => {
    it("should save config to workspace templates directory", async () => {
      fsStub.existsSync.returns(false);
      await manager.saveConfig(mockConfig, "/workspace");

      expect(
        fsStub.mkdirSync.calledWith("/workspace/.vscode/commit-templates", {
          recursive: true,
        }),
      ).toBe(true);
      expect(fsStub.writeFileSync.called).toBe(true);
      const writeArgs = fsStub.writeFileSync.args[0];
      expect(writeArgs[0]).toMatch(
        /\/workspace\/.vscode\/commit-templates\/test-template\.json$/,
      );
      const written = JSON.parse(writeArgs[1]);
      expect(written.name).toBe("Test Template");
      expect(written.$schema).toBeDefined();
    });

    it("should throw error if no workspace path", async () => {
      await expect(manager.saveConfig(mockConfig, undefined)).rejects.toThrow(
        "No open repository/workspace",
      );
    });
  });

  describe("deleteConfig", () => {
    it("should delete workspace template", async () => {
      // Mock that template exists in workspace
      const customConfig = { ...mockConfig, name: "Custom" };
      fsStub.existsSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(true);
      fsStub.readdirSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(["custom.json"]);
      fsStub.readFileSync
        .withArgs("/workspace/.vscode/commit-templates/custom.json", "utf8")
        .returns(JSON.stringify(customConfig));

      const filePath = "/workspace/.vscode/commit-templates/custom.json";
      fsStub.existsSync.withArgs(filePath).returns(true);

      await manager.deleteConfig("Custom", "/workspace");
      expect(fsStub.unlinkSync.calledWith(filePath)).toBe(true);
    });

    it("should not delete built-in templates", async () => {
      await expect(
        manager.deleteConfig("Conventional Commits", "/workspace"),
      ).rejects.toThrow("Built-in templates cannot be deleted");
    });

    it("should reset active config if deleted is active", async () => {
      workspaceStateStub.get.mockReturnValue("Custom");
      const custom = { ...mockConfig, name: "Custom" };
      const fallback = { ...mockConfig, name: "Fallback" };

      fsStub.existsSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(true);
      fsStub.readdirSync
        .withArgs("/workspace/.vscode/commit-templates")
        .returns(["custom.json"]);
      fsStub.readFileSync
        .withArgs("/workspace/.vscode/commit-templates/custom.json", "utf8")
        .returns(JSON.stringify(custom));

      fsStub.existsSync.withArgs("/mock/extension/templates").returns(true);
      fsStub.readdirSync
        .withArgs("/mock/extension/templates")
        .returns(["fallback.json"]);
      fsStub.readFileSync
        .withArgs("/mock/extension/templates/fallback.json", "utf8")
        .returns(JSON.stringify(fallback));

      const filePath = "/workspace/.vscode/commit-templates/custom.json";
      fsStub.existsSync.withArgs(filePath).returns(true);

      await manager.deleteConfig("Custom", "/workspace");
      expect(workspaceStateStub.update).toHaveBeenCalledWith(
        "gitCommitMessageEditor.activeConfigName",
        "Fallback",
      );
    });
  });
});
