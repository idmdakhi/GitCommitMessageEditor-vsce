import * as vscode from "vscode";
import { ConfigManager } from "../config/configManager";
import { PortableConfig } from "../config/types";
import { t } from "../i18n";

export class ConfigEditorPanel {
  public static currentPanel: ConfigEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    context: vscode.ExtensionContext,
    manager: ConfigManager,
    onChange: () => void,
  ) {
    if (ConfigEditorPanel.currentPanel) {
      ConfigEditorPanel.currentPanel.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "gitCommitMessageEditorConfig",
      t("configEditor.title"),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    ConfigEditorPanel.currentPanel = new ConfigEditorPanel(
      panel,
      context,
      manager,
      onChange,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private context: vscode.ExtensionContext,
    private manager: ConfigManager,
    private onChange: () => void,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  private getCwd(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private post() {
    const cwd = this.getCwd();
    const configs = this.manager.getAllConfigs(cwd);
    const active = this.manager.getActiveConfig(cwd);
    this.panel.webview.postMessage({
      type: "init",
      configs: configs.map((c) => ({
        ...c,
        isWorkspaceTemplate: this.manager.isWorkspaceTemplate(c.name, cwd),
      })),
      activeName: active.name,
      hasWorkspace: !!cwd,
    });
  }

  private async handleMessage(msg: any) {
    const cwd = this.getCwd();
    switch (msg.type) {
      case "ready":
        this.post();
        break;
      case "activate":
        await this.manager.setActiveConfig(msg.name);
        this.onChange();
        this.post();
        vscode.window.showInformationMessage(
          t("configEditor.activateSuccess", { name: msg.name }),
        );
        break;
      case "save": {
        const cfg = msg.config as PortableConfig;
        try {
          this.validate(cfg);
          await this.manager.saveConfig(cfg, cwd);
          this.onChange();
          this.post();
          vscode.window.showInformationMessage(
            t("configEditor.saveSuccess", { name: cfg.name }),
          );
        } catch (e: any) {
          vscode.window.showErrorMessage(
            t("configEditor.validationError") + (e.message ?? e),
          );
        }
        break;
      }
      case "delete":
        try {
          await this.manager.deleteConfig(msg.name, cwd);
          this.onChange();
          this.post();
        } catch (e: any) {
          vscode.window.showErrorMessage(e.message ?? String(e));
        }
        break;
      case "export": {
        const cfg = msg.config as PortableConfig;
        await this.manager.exportConfig(cfg);
        break;
      }
      case "import": {
        const imported = await this.manager.importConfig(cwd);
        if (imported) {
          this.onChange();
          this.post();
        }
        break;
      }
      default:
        break;
    }
  }

  private validate(cfg: PortableConfig) {
    if (!cfg.name || !cfg.name.trim()) {
      throw new Error(t("configEditor.nameRequired"));
    }
    if (!Array.isArray(cfg.tokens) || cfg.tokens.length === 0) {
      throw new Error(t("configEditor.tokenRequired"));
    }
    const names = new Set<string>();
    // نکته: از نام `token` استفاده می‌شود نه `t`، چون `t` نام تابع ترجمه‌ی
    // import‌شده در بالای فایل است — استفاده از `t` به‌عنوان نام متغیر حلقه
    // آن را در این scope مخفی می‌کرد و هر فراخوانی t(...) درون حلقه با خطای
    // «t is not a function» مواجه می‌شد.
    for (const token of cfg.tokens) {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(token.name)) {
        throw new Error(
          t("configEditor.invalidTokenName", { name: token.name }),
        );
      }
      if (names.has(token.name)) {
        throw new Error(
          t("configEditor.duplicateTokenName", { name: token.name }),
        );
      }
      names.add(token.name);
      if (token.type === "enum" && (!token.options || token.options.length === 0)) {
        throw new Error(
          t("configEditor.enumRequiresOptions", { name: token.name }),
        );
      }
    }
    if (!Array.isArray(cfg.template) || cfg.template.length === 0) {
      throw new Error(t("configEditor.templateRequired"));
    }
  }

  private getHtml(): string {
    const nonce = getNonce();
    return /* html */ `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px 24px 48px; }
  h1 { font-size: 15px; }
  select, button, input, textarea { font-family: var(--vscode-font-family); font-size: 12.5px; }
  select, input[type=text] { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 5px 8px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; }
  button.secondary { background: transparent; border: 1px solid var(--vscode-panel-border); color: var(--vscode-foreground); }
  button:disabled { opacity: 0.5; cursor: default; }
  .row { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
  textarea#json-editor { width: 100%; box-sizing: border-box; height: 480px; font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); border-radius: 4px; padding: 10px; }
  .hint { font-size: 11.5px; opacity: 0.75; margin: 6px 0 14px; line-height: 1.7; }
  code { background: rgba(127,127,127,0.15); padding: 1px 5px; border-radius: 3px; }
</style>
</head>
<body>
  <h1>Commit Message Template Settings</h1>
  <div class="row">
    <label for="preset-select">Active template:</label>
    <select id="preset-select"></select>
    <button id="btn-activate">Activate</button>
    <button class="secondary" id="btn-new">Duplicate template</button>
    <button class="secondary" id="btn-delete">Delete</button>
  </div>
  <div class="hint" id="source-hint"></div>
  <div class="row">
    <button id="btn-save">💾 Save changes</button>
    <button class="secondary" id="btn-export">Export JSON</button>
    <button class="secondary" id="btn-import">Import from JSON</button>
  </div>
  <div class="hint">
    Edit the template structure as JSON. Each token is an object with <code>name</code>, <code>label</code>,
    <code>type</code> (<code>text</code> | <code>boolean</code> | <code>enum</code>), and optionally
    <code>prefix</code>, <code>suffix</code>, <code>multiline</code>, <code>issueList</code>, <code>perLine</code>,
    <code>options</code>. In <code>template</code>, each line may contain <code>{tokenName}</code>;
    lines where all tokens are empty are automatically removed from the final message. Structure follows
    <code>schemas/v1-template.schema.json</code>.
  </div>
  <textarea id="json-editor" spellcheck="false"></textarea>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let configs = [];
    let activeName = '';
    let currentEditingName = '';
    let hasWorkspace = false;

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'init') {
        configs = msg.configs;
        activeName = msg.activeName;
        currentEditingName = activeName;
        hasWorkspace = !!msg.hasWorkspace;
        renderSelect();
        loadIntoEditor(activeName);
        renderSourceHint();
      }
    });
    vscode.postMessage({ type: 'ready' });

    function renderSelect() {
      const sel = document.getElementById('preset-select');
      sel.innerHTML = configs.map(c => {
        const source = c.isWorkspaceTemplate ? 'repo: .vscode/commit-templates' : 'built-in';
        const activeSuffix = c.name === activeName ? ' — active' : '';
        return \`<option value="\${escapeAttr(c.name)}" \${c.name === activeName ? 'selected' : ''}>\${escapeHtml(c.name)} (\${source}\${activeSuffix})</option>\`;
      }).join('');
      sel.value = currentEditingName;
    }

    function loadIntoEditor(name) {
      const cfg = configs.find(c => c.name === name) || configs[0];
      currentEditingName = cfg.name;
      const { isWorkspaceTemplate, ...portable } = cfg;
      document.getElementById('json-editor').value = JSON.stringify(portable, null, 2);
      renderSourceHint();
    }

    function renderSourceHint() {
      const cfg = configs.find(c => c.name === currentEditingName);
      const deleteBtn = document.getElementById('btn-delete');
      const isWorkspace = !!(cfg && cfg.isWorkspaceTemplate);
      deleteBtn.disabled = !isWorkspace;
      deleteBtn.title = isWorkspace ? '' : 'Built-in templates cannot be deleted.';

      const hint = document.getElementById('source-hint');
      const lines = [
        'Priority — <b>repo templates</b> (<code>.vscode/commit-templates/*.json</code>) always win over <b>built-in templates</b> (bundled with the extension) when names match.',
      ];
      if (cfg) {
        lines.push(
          isWorkspace
            ? 'This template is saved in the current repo and can be edited, deleted, or shared via version control.'
            : 'This is a built-in template. Use “Duplicate template” to create an editable, repo-saved copy.',
        );
      }
      if (!hasWorkspace) {
        lines.push('⚠ No workspace folder is open — saving a new/duplicated template will fail until you open a repo.');
      }
      hint.innerHTML = lines.join('<br/>');
    }

    document.getElementById('preset-select').addEventListener('change', (e) => {
      loadIntoEditor(e.target.value);
    });

    document.getElementById('btn-activate').addEventListener('click', () => {
      vscode.postMessage({ type: 'activate', name: currentEditingName });
    });

    document.getElementById('btn-new').addEventListener('click', () => {
      try {
        const cfg = JSON.parse(document.getElementById('json-editor').value);
        cfg.name = cfg.name + ' (copy)';
        document.getElementById('json-editor').value = JSON.stringify(cfg, null, 2);
        currentEditingName = cfg.name;
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });

    document.getElementById('btn-delete').addEventListener('click', () => {
      vscode.postMessage({ type: 'delete', name: currentEditingName });
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      try {
        const cfg = JSON.parse(document.getElementById('json-editor').value);
        vscode.postMessage({ type: 'save', config: cfg });
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      try {
        const cfg = JSON.parse(document.getElementById('json-editor').value);
        vscode.postMessage({ type: 'export', config: cfg });
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    });

    document.getElementById('btn-import').addEventListener('click', () => {
      vscode.postMessage({ type: 'import' });
    });

    function escapeHtml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function escapeAttr(s) { return escapeHtml(s).replace(/"/g,'&quot;'); }
  </script>
</body>
</html>`;
  }

  public dispose() {
    ConfigEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
