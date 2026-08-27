import * as fs from "node:fs";
import * as path from "node:path";
import { PortableConfig } from "./types";

export function loadDefaultConfig(extensionPath: string): PortableConfig {
  const defaultPath = path.join(extensionPath, "templates", "default.json");
  if (fs.existsSync(defaultPath)) {
    const raw = fs.readFileSync(defaultPath, "utf8");
    return JSON.parse(raw) as PortableConfig;
  }
  // اگر فایل default.json وجود نداشت، یک قالب حداقلی بسازید تا افزونه از کار نیفتد
  // (اما ترجیحاً این حالت نباید رخ دهد)
  console.warn(
    "[GitCommitEditor] default.json not found; using minimal fallback.",
  );
  return {
    configVersion: "1",
    name: "Text",
    template: ["{subject}", "", "{body}"],
    tokens: [
      {
        label: "Subject",
        name: "subject",
        type: "text",
        required: true,
        maxLength: 72,
      },
      {
        label: "Body",
        name: "body",
        type: "text",
        multiline: true,
        lines: 4,
      },
    ],
  };
}
