// __mocks__/vscode.ts
// Manual mock of the 'vscode' module for unit tests.
// Wired up via moduleNameMapper in jest.config.js (there's no real
// 'vscode' package installed in a plain node_modules tree).

export class Disposable {
  private _callback?: () => void;
  constructor(callback?: () => void) {
    this._callback = callback;
  }
  dispose = jest.fn(() => {
    this._callback?.();
  });
}

export class EventEmitter<T> {
  private _listeners: Array<(e: T) => any> = [];

  event = (listener: (e: T) => any): Disposable => {
    this._listeners.push(listener);
    return new Disposable(() => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    });
  };

  fire = (data: T): void => {
    for (const listener of [...this._listeners]) {
      listener(data);
    }
  };

  dispose = jest.fn();
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export enum FileType {
  Unknown = 0,
  File = 1,
  Directory = 2,
  SymbolicLink = 64,
}

export enum FileChangeType {
  Changed = 1,
  Created = 2,
  Deleted = 3,
}

class FileSystemErrorImpl extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export const FileSystemError = {
  FileNotFound: (uri?: any) =>
    new FileSystemErrorImpl(`FileNotFound: ${uri}`, "FileNotFound"),
  NoPermissions: (msg?: string) =>
    new FileSystemErrorImpl(msg || "NoPermissions", "NoPermissions"),
};

export const Uri = {
  // Uri.parse preserves the exact original string via toString() — several
  // existing tests (gitEditorProvider) compare .toString() against the raw
  // input, e.g. "gitcme:/COMMIT_EDITMSG".
  parse: jest.fn((value: string) => makeParsedUri(value)),
  // Uri.file sets fsPath to the exact raw filesystem path passed in,
  // matching real vscode.Uri.file(path).fsPath === path.
  file: jest.fn((fsPath: string) => ({
    scheme: "file",
    path: fsPath,
    fsPath,
    toString: () => `file://${fsPath}`,
  })),
};

function makeParsedUri(value: string) {
  const [scheme, rest] = value.split(/:(.+)/);
  return {
    scheme,
    path: rest,
    fsPath: rest,
    toString: () => value,
  };
}

// ---- shared mutable test state ----
// Some tests (configManager, git) need to simulate save/open dialog
// results, a virtual filesystem for vscode.workspace.fs, recorded
// message-box calls, and fake installed extensions. This is exported both
// as a named export (`import { __mockState } from "../__mocks__/vscode"`)
// and reachable via `import { __mockState } from "vscode"` since
// moduleNameMapper resolves "vscode" to this file.
export const __mockState: {
  saveDialogResult: { fsPath: string } | undefined;
  openDialogResult: { fsPath: string }[] | undefined;
  writtenFiles: Map<string, Buffer>;
  informationMessages: string[];
  warningMessages: string[];
  errorMessages: string[];
  extensions: Map<string, any>;
} = {
  saveDialogResult: undefined,
  openDialogResult: undefined,
  writtenFiles: new Map(),
  informationMessages: [],
  warningMessages: [],
  errorMessages: [],
  extensions: new Map(),
};

export function __resetMockState() {
  __mockState.saveDialogResult = undefined;
  __mockState.openDialogResult = undefined;
  __mockState.writtenFiles = new Map();
  __mockState.informationMessages = [];
  __mockState.warningMessages = [];
  __mockState.errorMessages = [];
  __mockState.extensions = new Map();
}

// Jest globals are available in any module loaded within the test
// environment, not just *.test.ts files, so this runs automatically
// before every test in any file that imports this mock — no per-test-file
// boilerplate required.
beforeEach(() => {
  __resetMockState();
});

function makeMemoryState() {
  const store = new Map<string, any>();
  return {
    get: jest.fn((key: string, defaultValue?: any) =>
      store.has(key) ? store.get(key) : defaultValue,
    ),
    update: jest.fn(async (key: string, value: any) => {
      if (value === undefined) {
        store.delete(key);
      } else {
        store.set(key, value);
      }
    }),
  };
}

/** Build a minimal but realistic vscode.ExtensionContext mock. */
export function makeMockExtensionContext(extensionPath: string) {
  return {
    extensionPath,
    subscriptions: [] as any[],
    workspaceState: makeMemoryState(),
    globalState: makeMemoryState(),
  };
}

// ---- workspace ----
const configStore: Record<string, any> = {};

const defaultConfigObject = {
  get: jest.fn((_key: string, defaultValue?: any) => defaultValue),
  update: jest.fn().mockResolvedValue(undefined),
};

export const workspace = {
  getConfiguration: jest.fn(() => defaultConfigObject),
  onDidChangeConfiguration: jest.fn(() => new Disposable()),
  registerFileSystemProvider: jest.fn(() => new Disposable()),
  registerTextDocumentContentProvider: jest.fn(() => new Disposable()),
  openTextDocument: jest.fn((uri: any) =>
    Promise.resolve({
      uri,
      getText: jest.fn(() => ""),
    }),
  ),
  textDocuments: [] as any[],
  onDidSaveTextDocument: jest.fn(() => new Disposable()),
  fs: {
    writeFile: jest.fn(async (uri: any, content: Uint8Array) => {
      __mockState.writtenFiles.set(uri.fsPath, Buffer.from(content));
    }),
    readFile: jest.fn(async (uri: any) => {
      const data = __mockState.writtenFiles.get(uri.fsPath);
      if (!data) {
        throw FileSystemError.FileNotFound(uri.fsPath);
      }
      return data;
    }),
    stat: jest.fn(async (uri: any) => {
      const data = __mockState.writtenFiles.get(uri.fsPath);
      if (!data) {
        throw FileSystemError.FileNotFound(uri.fsPath);
      }
      return {
        type: FileType.File,
        ctime: Date.now(),
        mtime: Date.now(),
        size: data.length,
      };
    }),
  },
};

// ---- window ----
function makeStatusBarItem() {
  return {
    text: "",
    tooltip: "",
    command: "",
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  };
}

export const window = {
  createStatusBarItem: jest.fn(() => makeStatusBarItem()),
  showTextDocument: jest.fn(() =>
    Promise.resolve({
      document: { uri: { toString: () => "" } },
    }),
  ),
  showInformationMessage: jest.fn((message: string) => {
    __mockState.informationMessages.push(message);
    return Promise.resolve(undefined);
  }),
  showWarningMessage: jest.fn((message: string) => {
    __mockState.warningMessages.push(message);
    return Promise.resolve(undefined);
  }),
  showErrorMessage: jest.fn((message: string) => {
    __mockState.errorMessages.push(message);
    return Promise.resolve(undefined);
  }),
  showSaveDialog: jest.fn(async (_options?: any) => __mockState.saveDialogResult),
  showOpenDialog: jest.fn(async (_options?: any) => __mockState.openDialogResult),
  onDidChangeVisibleTextEditors: jest.fn(() => new Disposable()),
};

// ---- commands ----
export const commands = {
  registerCommand: jest.fn(() => new Disposable()),
  executeCommand: jest.fn(() => Promise.resolve(undefined)),
};

// ---- env ----
export const env = {
  language: "en",
};

// ---- extensions ----
export const extensions = {
  getExtension: jest.fn((id: string) => __mockState.extensions.get(id)),
};
