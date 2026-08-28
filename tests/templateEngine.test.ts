import { PortableConfig, Token } from "../src/config/types";

// ===== Functions copied from main.js (adapted for Node) =====

function issueList(raw: string): string {
  return String(raw || "")
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .join(", ");
}

function computeTokenOutput(
  token: Token,
  values: Record<string, string | boolean>,
  conditionalEnabled: Record<string, boolean>,
  autoGitmoji: boolean,
): string {
  if (!token) return "";

  if (token.name === "gitmoji" && !autoGitmoji) {
    return "";
  }

  // Check conditional
  const isCollapsible = !token.required && token.type !== "boolean";
  if (isCollapsible && !conditionalEnabled[token.name]) {
    return "";
  }

  if (token.type === "boolean") {
    const checked = !!values[token.name];
    if (!checked) return "";
    return (token.prefix || "") + (token.value || "") + (token.suffix || "");
  }

  const raw = String(values[token.name] ?? "");
  if (!raw.trim()) return "";

  if (token.issueList) {
    return (token.prefix || "") + issueList(raw) + (token.suffix || "");
  }

  if (token.perLine) {
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (token.prefix || "") + line + (token.suffix || ""))
      .join("\n");
  }

  return (token.prefix || "") + raw.trim() + (token.suffix || "");
}

function buildMessage(
  config: PortableConfig,
  values: Record<string, string | boolean>,
  conditionalEnabled: Record<string, boolean>,
  autoGitmoji: boolean,
): string {
  if (!config?.template) return "";

  const collected: string[] = [];
  for (const templateLine of config.template) {
    if (templateLine.trim() === "") {
      collected.push("");
      continue;
    }

    const rendered = templateLine.replace(/\{(\w+)\}/g, (_, name) => {
      const token = config.tokens.find((t) => t.name === name);
      return token
        ? computeTokenOutput(token, values, conditionalEnabled, autoGitmoji)
        : "";
    });

    if (rendered.trim()) {
      collected.push(rendered);
    }
  }

  const output: string[] = [];
  for (const line of collected) {
    if (line === "") {
      if (output.length === 0 || output[output.length - 1] === "") {
        continue;
      }
      output.push("");
    } else {
      output.push(line);
    }
  }

  while (output.length && output[output.length - 1] === "") {
    output.pop();
  }

  return output.join("\n");
}

// ===== Tests =====

describe("Template Engine", () => {
  describe("issueList", () => {
    it("should add # to each issue number", () => {
      expect(issueList("123, 456")).toBe("#123, #456");
      expect(issueList("#123, 456")).toBe("#123, #456");
      expect(issueList(" 123 , 456 ")).toBe("#123, #456");
      expect(issueList("")).toBe("");
      expect(issueList("abc")).toBe("#abc");
    });
  });

  describe("computeTokenOutput", () => {
    const values: Record<string, string | boolean> = {};
    const conditionalEnabled: Record<string, boolean> = {};

    it("should return empty for gitmoji when autoGitmoji is false", () => {
      const token: Token = { label: "Gitmoji", name: "gitmoji", type: "enum" };
      expect(computeTokenOutput(token, values, conditionalEnabled, false)).toBe(
        "",
      );
    });

    it("should return empty for conditional field when disabled", () => {
      const token: Token = { label: "Scope", name: "scope", type: "text" };
      conditionalEnabled.scope = false;
      expect(computeTokenOutput(token, values, conditionalEnabled, true)).toBe(
        "",
      );
    });

    it("should return boolean value when checked", () => {
      const token: Token = {
        label: "Needs Review",
        name: "needsReview",
        type: "boolean",
        prefix: "Review: ",
        value: "true",
        suffix: "!",
      };
      values.needsReview = true;
      expect(computeTokenOutput(token, values, conditionalEnabled, true)).toBe(
        "Review: true!",
      );
    });

    it("should return empty for unchecked boolean", () => {
      const token: Token = {
        label: "Needs Review",
        name: "needsReview",
        type: "boolean",
      };
      values.needsReview = false;
      expect(computeTokenOutput(token, values, conditionalEnabled, true)).toBe(
        "",
      );
    });

    it("should apply prefix and suffix to text", () => {
      const token: Token = {
        label: "Closes",
        name: "closes",
        type: "text",
        prefix: "Closes: ",
        suffix: ".",
        issueList: true,
      };
      values.closes = "123, 456";
      expect(computeTokenOutput(token, values, conditionalEnabled, true)).toBe(
        "Closes: #123, #456.",
      );
    });

    it("should apply perLine to multiline fields", () => {
      const token: Token = {
        label: "Co-authored-by",
        name: "coAuthoredBy",
        type: "text",
        multiline: true,
        perLine: true,
        prefix: "Co-authored-by: ",
      };
      values.coAuthoredBy =
        "John Doe <john@example.com>\nJane Doe <jane@example.com>";
      const result = computeTokenOutput(
        token,
        values,
        conditionalEnabled,
        true,
      );
      expect(result).toBe(
        "Co-authored-by: John Doe <john@example.com>\nCo-authored-by: Jane Doe <jane@example.com>",
      );
    });
  });

  describe("buildMessage", () => {
    const config: PortableConfig = {
      version: "1",
      name: "Test",
      template: [
        "{type}{scope}{subject}",
        "",
        "{body}",
        "",
        "{closes}",
        "{coAuthoredBy}",
        "{needsReview}",
      ],
      tokens: [
        {
          label: "Type",
          name: "type",
          type: "enum",
          required: true,
          options: [{ label: "feat" }],
        },
        {
          label: "Scope",
          name: "scope",
          type: "text",
          prefix: "(",
          suffix: ")",
        },
        {
          label: "Subject",
          name: "subject",
          type: "text",
          required: true,
          prefix: ": ",
        },
        { label: "Body", name: "body", type: "text", multiline: true },
        {
          label: "Closes",
          name: "closes",
          type: "text",
          prefix: "Closes: ",
          issueList: true,
        },
        {
          label: "Co-authored-by",
          name: "coAuthoredBy",
          type: "text",
          multiline: true,
          perLine: true,
          prefix: "Co-authored-by: ",
        },
        {
          label: "Needs Review",
          name: "needsReview",
          type: "boolean",
          value: "Review required",
        },
      ],
    };

    const values: Record<string, string | boolean> = {
      type: "feat",
      scope: "api",
      subject: "add new endpoint",
      body: "This is the body.\nSecond line.",
      closes: "123, 456",
      coAuthoredBy: "John <john@example.com>\nJane <jane@example.com>",
      needsReview: true,
    };

    const conditionalEnabled: Record<string, boolean> = {
      scope: true,
      closes: true,
      coAuthoredBy: true,
      body: true,
    };

    it("should build full message correctly", () => {
      const message = buildMessage(config, values, conditionalEnabled, true);
      const lines = message.split("\n");
      expect(lines[0]).toBe("feat(api): add new endpoint");
      expect(lines[1]).toBe("");
      expect(lines[2]).toBe("This is the body.");
      expect(lines[3]).toBe("Second line.");
      expect(lines[4]).toBe("");
      expect(lines[5]).toBe("Closes: #123, #456");
      expect(lines[6]).toBe("Co-authored-by: John <john@example.com>");
      expect(lines[7]).toBe("Co-authored-by: Jane <jane@example.com>");
      expect(lines[8]).toBe("Review required");
    });

    it("should collapse consecutive empty lines", () => {
      const msg = buildMessage(
        config,
        { type: "feat", subject: "test" },
        { type: true, subject: true },
        true,
      );
      expect(msg).toBe("feat: test");
    });

    it("should skip lines where all tokens are empty", () => {
      const emptyValues = {
        type: "feat",
        subject: "test",
        // scope, body, closes, coAuthoredBy, needsReview are empty
      };
      const enabled = { type: true, subject: true };
      const msg = buildMessage(config, emptyValues, enabled, true);
      expect(msg).toBe("feat: test");
    });
  });
});
