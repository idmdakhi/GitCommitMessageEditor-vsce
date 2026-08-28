/**
 * Minimal mock of the 'vscode' API surface used by this extension's source
 * files, so the TypeScript sources can be unit-tested with plain Jest
 * outside of a real VS Code host.
 *
 * Only what is actually imported/used across src/** is implemented.
 */

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export class Uri {
  private constructor(public fsPath: string) {}
  static file(p: string): Uri {
    return new Uri(p);
  }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    const path = require("path");
    return new Uri(path.join(base.fsPath, ...segments));
  }
  toString() {
    return this.fsPath;
  }
}

export class Disposable {
  constructor(private callOnDispose: () => void) {}
  dispose() {
    this.callOnDispose();
  }
}

export class CancellationTokenSource {
  token = {
    isCancellationRequested: false,
    onCancellationRequested: () => new Disposable(() => {}),
  };
  cancel() {
    this.token.isCancellationRequested = true;
  }
  dispose() {}
}

export const LanguageModelChatMessage = {
  User: (content: string) => ({ role: "user", content }),
};

// ---- mutable state the tests can poke at ----
export const __mockState = {
  configuration: new Map<string, any>(),
  workspaceFolders: undefined as { uri: Uri }[] | undefined,
  extensions: new Map<string, any>(),
  informationMessages: [] as string[],
  warningMessages: [] as string[],
  errorMessages: [] as string[],
  saveDialogResult: undefined as Uri | undefined,
  openDialogResult: undefined as Uri[] | undefined,
  clipboardText: "",
  writtenFiles: new Map<string, Buffer>(),
  lmModels: [] as any[],
};

export function __resetMockState() {
  __mockState.configuration = new Map();
  __mockState.workspaceFolders = undefined;
  __mockState.extensions = new Map();
  __mockState.informationMessages = [];
  __mockState.warningMessages = [];
  __mockState.errorMessages = [];
  __mockState.saveDialogResult = undefined;
  __mockState.openDialogResult = undefined;
  __mockState.clipboardText = "";
  __mockState.writtenFiles = new Map();
  __mockState.lmModels = [];
}

class MockConfiguration {
  constructor(private section: string) {}
  get<T>(key: string, defaultValue?: T): T {
    const full = `${this.section}.${key}`;
    return __mockState.configuration.has(full)
      ? __mockState.configuration.get(full)
      : (defaultValue as T);
  }
  async update(key: string, value: any) {
    __mockState.configuration.set(`${this.section}.${key}`, value);
  }
}

export const workspace = {
  getConfiguration(section: string) {
    return new MockConfiguration(section);
  },
  get workspaceFolders() {
    return __mockState.workspaceFolders;
  },
  fs: {
    async writeFile(uri: Uri, content: Uint8Array) {
      __mockState.writtenFiles.set(uri.fsPath, Buffer.from(content));
    },
    async readFile(uri: Uri): Promise<Uint8Array> {
      const buf = __mockState.writtenFiles.get(uri.fsPath);
      if (!buf) {
        throw new Error(`ENOENT: ${uri.fsPath}`);
      }
      return buf;
    },
  },
  onDidChangeConfiguration: jest.fn((callback) => {
    // یک شبیه‌سازی ساده که یک Disposable برگرداند
    return new Disposable(() => {});
  }),
};

export const window = {
  async showInformationMessage(msg: string, ..._rest: any[]) {
    __mockState.informationMessages.push(msg);
    return undefined;
  },
  async showWarningMessage(msg: string, ..._rest: any[]) {
    __mockState.warningMessages.push(msg);
    return undefined;
  },
  async showErrorMessage(msg: string, ..._rest: any[]) {
    __mockState.errorMessages.push(msg);
    return undefined;
  },
  async showSaveDialog(_opts: any) {
    return __mockState.saveDialogResult;
  },
  async showOpenDialog(_opts: any) {
    return __mockState.openDialogResult;
  },
  createStatusBarItem(_alignment?: StatusBarAlignment, _priority?: number) {
    return {
      text: "",
      tooltip: "",
      command: "",
      show() {},
      hide() {},
      dispose() {},
    };
  },
  createWebviewPanel(
    _viewType: string,
    _title: string,
    _column: any,
    _opts: any,
  ) {
    return {
      webview: {
        html: "",
        cspSource: "vscode-webview:",
        asWebviewUri: (u: Uri) => u,
        postMessage: (_msg: any) => Promise.resolve(true),
        onDidReceiveMessage: (_cb: any) => new Disposable(() => {}),
      },
      reveal: (_col?: any) => {},
      onDidDispose: (_cb: any) => new Disposable(() => {}),
      dispose: () => {},
    };
  },
};

export const commands = {
  registerCommand(_command: string, _callback: (...args: any[]) => any) {
    return new Disposable(() => {});
  },
  async executeCommand(_command: string, ..._rest: any[]) {
    return undefined;
  },
};

export const env = {
  clipboard: {
    async writeText(text: string) {
      __mockState.clipboardText = text;
    },
    async readText() {
      return __mockState.clipboardText;
    },
  },
};

export const extensions = {
  getExtension(id: string) {
    return __mockState.extensions.get(id);
  },
};

export const lm = {
  async selectChatModels(_selector: any) {
    return __mockState.lmModels;
  },
};

export interface ExtensionContext {
  extensionPath: string;
  extensionUri: Uri;
  subscriptions: { dispose(): void }[];
  workspaceState: {
    get<T>(key: string, defaultValue?: T): T;
    update(key: string, value: any): Thenable<void>;
  };
}

export function makeMockExtensionContext(extensionPath = "/fake/ext/path") {
  const workspaceStateStore = new Map<string, any>();
  return {
    extensionPath,
    extensionUri: Uri.file(extensionPath),
    subscriptions: [] as { dispose(): void }[],
    workspaceState: {
      get<T>(key: string, defaultValue?: T): T {
        return workspaceStateStore.has(key)
          ? workspaceStateStore.get(key)
          : (defaultValue as T);
      },
      async update(key: string, value: any) {
        if (value === undefined) {
          workspaceStateStore.delete(key);
        } else {
          workspaceStateStore.set(key, value);
        }
      },
      keys() {
        return Array.from(workspaceStateStore.keys());
      },
    },
  };
}
