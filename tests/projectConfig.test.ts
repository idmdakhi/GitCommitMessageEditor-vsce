import * as fs from "fs";
import path from "path";
import {
  findProjectConfigFile,
  loadProjectConfig,
  projectConfigToPortableConfig,
  starterProjectConfigJson,
} from "../src/config/projectConfig";

jest.mock("fs");

describe("Project Config", () => {
  const cwd = "/workspace";

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("findProjectConfigFile", () => {
    it("should find JSON config file", () => {
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(false) // .commit-message-editor.json
        .mockReturnValueOnce(true); // .commit-message-editor.yaml
      const result = findProjectConfigFile(cwd);
      expect(result).toBe("/workspace/.commit-message-editor.yaml");
    });

    it("should return undefined if no config file exists", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const result = findProjectConfigFile(cwd);
      expect(result).toBeUndefined();
    });
  });

  describe("loadProjectConfig", () => {
    it("should load JSON config", () => {
      const configData = {
        name: "Team Config",
        types: ["feat", "fix"],
        maxSubjectLength: 60,
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify(configData),
      );

      const result = loadProjectConfig(cwd);
      expect(result).toBeDefined();
      expect(result?.data.name).toBe("Team Config");
      expect(result?.data.types).toEqual(["feat", "fix"]);
      expect(result?.fileName).toBe(".commit-message-editor.json");
    });

    it("should load YAML config", () => {
      const yamlContent = `
name: Team Config
types:
  - feat
  - fix
maxSubjectLength: 60
`;
      (fs.existsSync as jest.Mock)
        .mockReturnValueOnce(false) // .json
        .mockReturnValueOnce(true); // .yaml
      (fs.readFileSync as jest.Mock).mockReturnValue(yamlContent);

      const result = loadProjectConfig(cwd);
      expect(result).toBeDefined();
      expect(result?.data.name).toBe("Team Config");
      expect(result?.data.types).toEqual(["feat", "fix"]);
    });

    it("should throw error on invalid JSON", () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue("invalid json");

      expect(() => loadProjectConfig(cwd)).toThrow("Parse error");
    });
  });

  describe("projectConfigToPortableConfig", () => {
    it("should convert project config to portable config", () => {
      const project = {
        name: "Team Config",
        template: {
          template: ["{type}{subject}", "", "{body}"],
          tokens: [
            {
              label: "Type",
              name: "type",
              type: "enum",
              options: [{ label: "feat" }],
            },
            { label: "Subject", name: "subject", type: "text" },
          ],
        },
      };

      const result = projectConfigToPortableConfig("Fallback", project);
      expect(result).toBeDefined();
      expect(result?.name).toBe("Team Config");
      expect(result?.template).toEqual(["{type}{subject}", "", "{body}"]);
      expect(result?.tokens).toHaveLength(2);
    });

    it("should return undefined if no template key", () => {
      const project = { name: "Team Config" };
      const result = projectConfigToPortableConfig("Fallback", project);
      expect(result).toBeUndefined();
    });
  });

  describe("starterProjectConfigJson", () => {
    it("should return valid JSON", () => {
      const json = starterProjectConfigJson();
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty("version", "1");
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("template");
      expect(parsed).toHaveProperty("tokens");
      expect(parsed.tokens).toHaveLength(8);
    });
  });
});
