import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { loadDefaultConfig } from "../../src/config/defaultConfig";

describe("loadDefaultConfig", () => {
  let tmpExtensionPath: string;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    tmpExtensionPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "gitcme-defcfg-"),
    );
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpExtensionPath, { recursive: true, force: true });
    warnSpy.mockRestore();
  });

  it("loads templates/default.json when it exists", () => {
    const templatesDir = path.join(tmpExtensionPath, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    const config = {
      version: "1",
      name: "Custom Default",
      template: ["{subject}"],
      tokens: [{ label: "Subject", name: "subject", type: "text" }],
    };
    fs.writeFileSync(
      path.join(templatesDir, "default.json"),
      JSON.stringify(config),
    );

    const result = loadDefaultConfig(tmpExtensionPath);
    expect(result).toEqual(config);
  });

  it("falls back to a minimal built-in template when default.json is missing", () => {
    const result = loadDefaultConfig(tmpExtensionPath);
    expect(result.version).toBe("1");
    expect(result.name).toBe("Text");
    expect(result.template).toEqual(["{subject}", "", "{body}"]);
    expect(result.tokens).toHaveLength(2);
    expect(result.tokens[0]).toMatchObject({
      name: "subject",
      type: "text",
      required: true,
    });
    expect(result.tokens[1]).toMatchObject({
      name: "body",
      type: "text",
      multiline: true,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("default.json not found"),
    );
  });

  it("throws if default.json exists but contains invalid JSON", () => {
    const templatesDir = path.join(tmpExtensionPath, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir, "default.json"),
      "{ not valid json",
    );
    expect(() => loadDefaultConfig(tmpExtensionPath)).toThrow();
  });
});
