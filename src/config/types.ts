export type TokenType = "text" | "boolean" | "enum";

export interface TokenOption {
  label: string;
  description?: string;
}

export interface Token {
  label: string;
  name: string;
  type: TokenType;
  description?: string;
  prefix?: string;
  suffix?: string;
  value?: string; // for boolean tokens: value used when checked
  // text-only
  multiline?: boolean;
  monospace?: boolean;
  lines?: number;
  maxLines?: number;
  maxLength?: number;
  maxLineLength?: number;
  // enum-only
  multiple?: boolean;
  separator?: string;
  combobox?: boolean;
  options?: TokenOption[];
  // special formatting rules used by the generic template engine
  issueList?: boolean; // e.g. "12, 34" -> "#12, #34"
  perLine?: boolean; // apply prefix/suffix to each non-empty line separately
  conditional?: boolean; // render behind a "include this section" checkbox (e.g. BREAKING CHANGE)
  required?: boolean; // shown as a required (red-when-empty) chip on the status dashboard
}

export interface PortableConfig {
  configVersion: "1";
  name: string;
  template: string[];
  tokens: Token[];
}
