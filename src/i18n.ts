import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface I18nDictionary {
  [key: string]: string | { [key: string]: string | any };
}

export class I18nManager {
  private static instance: I18nManager;
  private currentLang: string = "en";
  private strings: I18nDictionary = {};

  private constructor() {}

  public static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  /**
   * Load the appropriate language file based on:
   * 1. Manual setting `gitCommitMessageEditor.language` (if set to a valid locale)
   * 2. Otherwise, VS Code's display language (`vscode.env.language`)
   * Falls back to English if the language is not supported.
   */
  public load(extensionPath: string): void {
    const config = vscode.workspace.getConfiguration("gitCommitMessageEditor");
    const manualLang = config.get<string>("language", "auto");

    let locale = manualLang;
    if (locale === "auto") {
      locale = vscode.env.language || "en";
    }

    const supportedLocales = ["en", "fa"];
    const lang = supportedLocales.includes(locale) ? locale : "en";

    this.currentLang = lang;

    try {
      const filePath = path.join(extensionPath, "l10n", `${lang}.json`);
      const raw = fs.readFileSync(filePath, "utf8");
      this.strings = JSON.parse(raw);
    } catch (error) {
      // Fallback to English
      console.warn(
        `[Gitcme i18n] Failed to load locale ${lang}, falling back to English.`,
      );
      try {
        const fallbackPath = path.join(extensionPath, "l10n", "en.json");
        const raw = fs.readFileSync(fallbackPath, "utf8");
        this.strings = JSON.parse(raw);
      } catch {
        this.strings = {};
      }
    }
  }

  /**
   * Get a translated string by dot-notation key.
   */
  public t(key: string): string {
    const parts = key.split(".");
    let result: any = this.strings;
    for (const part of parts) {
      if (result && typeof result === "object" && result[part] !== undefined) {
        result = result[part];
      } else {
        return key; // fallback to key
      }
    }
    return typeof result === "string" ? result : key;
  }

  public getDictionary(): I18nDictionary {
    return this.strings;
  }

  public getLanguage(): string {
    return this.currentLang;
  }
}

// Convenience function
export function t(key: string): string {
  return I18nManager.getInstance().t(key);
}

export function getI18nDictionary(): I18nDictionary {
  return I18nManager.getInstance().getDictionary();
}
