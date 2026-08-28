import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  findProjectConfigFile,
  loadProjectConfig,
  projectConfigToPortableConfig,
  starterProjectConfigJson,
  ProjectConfigFile,
} from "../../src/config/projectConfig";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gitcme-projcfg-"));
}

describe("projectConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("findProjectConfigFile", () => {
    it("returns undefined when no project config file exists", () => {
      expect(findProjectConfigFile(tmpDir)).toBeUndefined();
    });

    it("finds .commit-message-editor.json when present", () => {
      const file = path.join(tmpDir, ".commit-message-editor.json");
      fs.writeFileSync(file, "{}");
      expect(findProjectConfigFile(tmpDir)).toBe(file);
    });

    it("finds .commit-message-editor.yaml when present", () => {
      const file = path.join(tmpDir, ".commit-message-editor.yaml");
      fs.writeFileSync(file, "name: test");
      expect(findProjectConfigFile(tmpDir)).toBe(file);
    });

    it("finds .commit-message-editor.yml when present", () => {
      const file = path.join(tmpDir, ".commit-message-editor.yml");
      fs.writeFileSync(file, "name: test");
      expect(findProjectConfigFile(tmpDir)).toBe(file);
    });

    it("prefers .json over .yaml/.yml when multiple exist", () => {
      const jsonFile = path.join(tmpDir, ".commit-message-editor.json");
      const yamlFile = path.join(tmpDir, ".commit-message-editor.yaml");
      fs.writeFileSync(jsonFile, "{}");
      fs.writeFileSync(yamlFile, "name: test");
      expect(findProjectConfigFile(tmpDir)).toBe(jsonFile);
    });

    it("prefers .yaml over .yml when both exist (and no json)", () => {
      const yamlFile = path.join(tmpDir, ".commit-message-editor.yaml");
      const ymlFile = path.join(tmpDir, ".commit-message-editor.yml");
      fs.writeFileSync(yamlFile, "name: yaml");
      fs.writeFileSync(ymlFile, "name: yml");
      expect(findProjectConfigFile(tmpDir)).toBe(yamlFile);
    });
  });

  describe("loadProjectConfig", () => {
    it("returns undefined when no config file exists", () => {
      expect(loadProjectConfig(tmpDir)).toBeUndefined();
    });

    it("parses a valid JSON project config", () => {
      const file = path.join(tmpDir, ".commit-message-editor.json");
      const data: ProjectConfigFile = {
        name: "My Team",
        types: ["feat", "fix"],
        maxSubjectLength: 50,
      };
      fs.writeFileSync(file, JSON.stringify(data));

      const loaded = loadProjectConfig(tmpDir);
      expect(loaded).toBeDefined();
      expect(loaded!.fileName).toBe(".commit-message-editor.json");
      expect(loaded!.filePath).toBe(file);
      expect(loaded!.data.name).toBe("My Team");
      expect(loaded!.data.types).toEqual(["feat", "fix"]);
      expect(loaded!.data.maxSubjectLength).toBe(50);
    });

    it("parses a valid YAML project config", () => {
      const file = path.join(tmpDir, ".commit-message-editor.yaml");
      fs.writeFileSync(
        file,
        ["name: Yaml Team", "types:", "  - feat", "  - fix", ""].join("\n"),
      );

      const loaded = loadProjectConfig(tmpDir);
      expect(loaded).toBeDefined();
      expect(loaded!.data.name).toBe("Yaml Team");
      expect(loaded!.data.types).toEqual(["feat", "fix"]);
    });

    it("throws a descriptive error on invalid JSON", () => {
      const file = path.join(tmpDir, ".commit-message-editor.json");
      fs.writeFileSync(file, "{ this is not valid json ");
      expect(() => loadProjectConfig(tmpDir)).toThrow(
        /Parse error in \.commit-message-editor\.json/,
      );
    });

    it("throws a descriptive error on invalid YAML", () => {
      const file = path.join(tmpDir, ".commit-message-editor.yaml");
      // Unbalanced flow-mapping is invalid YAML and should fail to parse.
      fs.writeFileSync(file, "name: [unterminated");
      expect(() => loadProjectConfig(tmpDir)).toThrow(
        /Parse error in \.commit-message-editor\.yaml/,
      );
    });

    it("returns an empty data object when the file parses to null (empty file)", () => {
      const file = path.join(tmpDir, ".commit-message-editor.yaml");
      fs.writeFileSync(file, "");
      const loaded = loadProjectConfig(tmpDir);
      expect(loaded).toBeDefined();
      expect(loaded!.data).toEqual({});
    });
  });

  describe("projectConfigToPortableConfig", () => {
    it("returns undefined when project config has no template", () => {
      const project: ProjectConfigFile = { name: "No Template" };
      expect(projectConfigToPortableConfig("fallback", project)).toBeUndefined();
    });

    it("converts a project config with a template into a PortableConfig", () => {
      const project: ProjectConfigFile = {
        name: "Team convention",
        template: {
          template: ["{type}{subject}", "", "{body}"],
          tokens: [
            {
              label: "Type",
              name: "type",
              type: "enum",
              options: [{ label: "feat" }, { label: "fix" }],
            },
          ],
        },
      };

      const portable = projectConfigToPortableConfig("fallback", project);
      expect(portable).toEqual({
        version: "1",
        name: "Team convention",
        template: ["{type}{subject}", "", "{body}"],
        tokens: project.template!.tokens,
      });
    });

    it("falls back to the provided name when project.name is missing", () => {
      const project: ProjectConfigFile = {
        template: {
          template: ["{subject}"],
          tokens: [],
        },
      };
      const portable = projectConfigToPortableConfig("fallback-name", project);
      expect(portable!.name).toBe("fallback-name");
    });
  });

  describe("starterProjectConfigJson", () => {
    it("produces valid, parseable JSON ending with a newline", () => {
      const json = starterProjectConfigJson();
      expect(json.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("includes the expected top-level shape", () => {
      const parsed = JSON.parse(starterProjectConfigJson());
      expect(parsed.version).toBe("1");
      expect(typeof parsed.name).toBe("string");
      expect(Array.isArray(parsed.template)).toBe(true);
      expect(Array.isArray(parsed.tokens)).toBe(true);
      expect(parsed.tokens.length).toBeGreaterThan(0);
    });

    it("includes a required 'type' token and a required 'subject' token", () => {
      const parsed = JSON.parse(starterProjectConfigJson());
      const type = parsed.tokens.find((t: any) => t.name === "type");
      const subject = parsed.tokens.find((t: any) => t.name === "subject");
      expect(type?.required).toBe(true);
      expect(subject?.required).toBe(true);
    });
  });
});
