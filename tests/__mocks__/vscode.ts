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
  parse: jest.fn((value: string) => makeUri(value)),
  file: jest.fn((value: string) => makeUri(`file://${value}`)),
};

function makeUri(value: string) {
  const [scheme, rest] = value.split(/:(.+)/);
  return {
    scheme,
    path: rest,
    fsPath: rest,
    toString: () => value,
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
  showInformationMessage: jest.fn(() => Promise.resolve(undefined)),
  showWarningMessage: jest.fn(() => Promise.resolve(undefined)),
  showErrorMessage: jest.fn(() => Promise.resolve(undefined)),
  onDidChangeVisibleTextEditors: jest.fn(() => new Disposable()),
};

// ---- commands ----
export const commands = {
  registerCommand: jest.fn(() => new Disposable()),
  executeCommand: jest.fn(() => Promise.resolve(undefined)),
};

// ---- extensions ----
export const extensions = {
  getExtension: jest.fn(() => undefined),
};
