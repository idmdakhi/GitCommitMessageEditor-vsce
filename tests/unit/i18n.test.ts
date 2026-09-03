// tests/unit/i18n.test.ts
import * as path from "path";
import * as vscode from "vscode";
import { I18nManager, t, getI18nDictionary } from "../../src/i18n";

const REPO_ROOT = path.resolve(__dirname, "../..");

function configWith(values: Record<string, any>) {
  return {
    get: jest.fn((key: string, defaultValue?: any) =>
      key in values ? values[key] : defaultValue,
    ),
    update: jest.fn(),
  };
}

describe("I18nManager / t()", () => {
  const manager = I18nManager.getInstance();

  beforeEach(() => {
    jest.clearAllMocks();
    (vscode.env as any).language = "en";
  });

  it("is a singleton", () => {
    expect(I18nManager.getInstance()).toBe(manager);
  });

  it("loads the real English dictionary by default", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );

    manager.load(REPO_ROOT);

    expect(manager.getLanguage()).toBe("en");
    expect(manager.getDirection()).toBe("ltr");
    expect(t("title")).toBe("Commit Message Editor");
  });

  it("loads the real Persian dictionary when language is set to fa", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "fa" }),
    );

    manager.load(REPO_ROOT);

    expect(manager.getLanguage()).toBe("fa");
    expect(manager.getDirection()).toBe("rtl");
    expect(t("title")).not.toBe("title");
    expect(t("title")).not.toBe("Commit Message Editor");
  });

  it("falls back to English for an unsupported locale", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "xx-not-a-real-locale" }),
    );

    manager.load(REPO_ROOT);

    expect(manager.getLanguage()).toBe("en");
    expect(t("title")).toBe("Commit Message Editor");
  });

  it("follows vscode.env.language when set to auto", () => {
    (vscode.env as any).language = "fa";
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "auto" }),
    );

    manager.load(REPO_ROOT);

    expect(manager.getLanguage()).toBe("fa");
  });

  it("falls back to English when vscode.env.language is unsupported and set to auto", () => {
    (vscode.env as any).language = "de";
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "auto" }),
    );

    manager.load(REPO_ROOT);

    expect(manager.getLanguage()).toBe("en");
  });

  it("falls back gracefully (empty strings, no throw) when the extension path is bogus", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );

    expect(() => manager.load("/definitely/not/a/real/path")).not.toThrow();
    expect(t("title")).toBe("title");
  });

  it("returns the key itself for an unknown key", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );
    manager.load(REPO_ROOT);

    expect(t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  it("substitutes {param} placeholders", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );
    manager.load(REPO_ROOT);

    expect(t("configEditor.activateSuccess", { name: "My Template" })).toBe(
      "Template \u201cMy Template\u201d activated.",
    );
  });

  it("leaves unmatched placeholders untouched instead of throwing", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );
    manager.load(REPO_ROOT);

    // configEditor.activateSuccess expects {name}; we pass a different key
    expect(t("configEditor.activateSuccess", { wrongKey: "x" })).toBe(
      "Template \u201c{name}\u201d activated.",
    );
  });

  it("getI18nDictionary() returns the currently loaded dictionary", () => {
    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      configWith({ language: "en" }),
    );
    manager.load(REPO_ROOT);

    const dict = getI18nDictionary();
    expect(dict.title).toBe("Commit Message Editor");
  });
});
