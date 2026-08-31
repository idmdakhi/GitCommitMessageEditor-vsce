import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

type I18nKeys = keyof typeof enStrings;
type I18nNestedKeys = any; // برای سادگی از any استفاده می‌کنیم

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
   * Load the appropriate language file based on VS Code's display language.
   * Falls back to English if the language is not supported.
   */
  public load(extensionPath: string): void {
    // Get VS Code display language (e.g., 'en', 'fa', 'fr', ...)
    const locale = vscode.env.language || "en";
    const supportedLocales = ["en", "fa"];
    const lang = supportedLocales.includes(locale) ? locale : "en";

    this.currentLang = lang;

    try {
      const filePath = path.join(extensionPath, "l10n", `${lang}.json`);
      const raw = fs.readFileSync(filePath, "utf8");
      this.strings = JSON.parse(raw);
    } catch (error) {
      // Fallback to English if the file is missing or invalid
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
   * Example: get('form.typeLabel') -> "Type" or "نوع"
   */
  public t(key: string): string {
    const parts = key.split(".");
    let result: any = this.strings;
    for (const part of parts) {
      if (result && typeof result === "object" && result[part] !== undefined) {
        result = result[part];
      } else {
        // Key not found, return the key itself as fallback
        return key;
      }
    }
    return typeof result === "string" ? result : key;
  }

  /**
   * Get the entire dictionary (used to pass to webview)
   */
  public getDictionary(): I18nDictionary {
    return this.strings;
  }

  /**
   * Get the current language code
   */
  public getLanguage(): string {
    return this.currentLang;
  }
}

// Convenience function for use in other modules
export function t(key: string): string {
  return I18nManager.getInstance().t(key);
}

// Expose the dictionary for webview
export function getI18nDictionary(): I18nDictionary {
  return I18nManager.getInstance().getDictionary();
}
