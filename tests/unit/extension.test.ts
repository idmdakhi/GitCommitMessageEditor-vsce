// tests/unit/extension.test.ts
import { activate, deactivate } from "../../src/extension";
import * as vscode from "vscode";

// نکته: ماک شدن ماژول vscode توسط moduleNameMapper در jest.config.js انجام
// می‌شود (چون پکیج واقعی 'vscode' در node_modules وجود ندارد)، پس نیازی به
// jest.mock("vscode") نیست.
//
// نکته‌ی دوم: چون توابع ماک‌شده در __mocks__/vscode.ts از قبل jest.fn()
// هستند، از jest.spyOn(...) + spy.mockRestore() روی آن‌ها استفاده نمی‌کنیم.
// این ترکیب یک رفتار شناخته‌شده و گمراه‌کننده در Jest دارد: mockRestore()
// روی متدی که از قبل جای‌گزین (mock) شده، آن را به یک mock خالی و بدون
// پیاده‌سازی برمی‌گرداند، نه به پیاده‌سازی اصلی‌اش؛ در نتیجه از تست دوم به بعد
// مقادیر undefined برمی‌گردانند. به‌جای آن مستقیماً به همان jest.fn ماژول
// ماک ارجاع می‌دهیم و بین تست‌ها فقط mock.calls را (از طریق clearMocks در
// jest.config.js) پاک می‌کنیم.

const ALL_COMMAND_IDS = [
  "gitCommitMessageEditor.open",
  "gitCommitMessageEditor.openInNewTab",
  "gitCommitMessageEditor.openSettings",
  "gitCommitMessageEditor.openConfigEditor",
  "gitCommitMessageEditor.createProjectConfig",
  "gitCommitMessageEditor.amendLast",
  "gitCommitMessageEditor.undoLastInsert",
  "gitCommitMessageEditor.openAsGitEditor",
  "gitCommitMessageEditor.applyGitEditorMessage",
  "gitCommitMessageEditor.closeGitEditor",
];

const registerCommandMock = vscode.commands.registerCommand as jest.Mock;
const createStatusBarItemMock = vscode.window.createStatusBarItem as jest.Mock;
const onDidChangeConfigMock = vscode.workspace
  .onDidChangeConfiguration as jest.Mock;
const registerFsProviderMock = vscode.workspace
  .registerFileSystemProvider as jest.Mock;
const registerTextDocProviderMock = vscode.workspace
  .registerTextDocumentContentProvider as jest.Mock;
const getConfigurationMock = vscode.workspace.getConfiguration as jest.Mock;

function makeContext(): any {
  return {
    subscriptions: [],
    extensionPath: "/fake/ext",
    workspaceState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function configWith(enableStatusBar: boolean) {
  return {
    get: jest.fn().mockReturnValue(enableStatusBar),
    update: jest.fn(),
  };
}

describe("extension activate/deactivate", () => {
  let context: any;

  beforeEach(() => {
    jest.clearAllMocks();
    getConfigurationMock.mockReturnValue(configWith(false));
    context = makeContext();
  });

  afterEach(() => {
    // extension.ts نگه‌دارنده‌ی statusBarItem را به‌صورت متغیر سطح ماژول
    // (module-level singleton) نگه می‌دارد، نه در context. اگر بین تست‌ها
    // پاک نشود، وضعیت از یک تست به تست بعدی نشت می‌کند (مثلاً تست بعدی فکر
    // می‌کند status bar از قبل ساخته شده). deactivate() آن را ریست می‌کند.
    deactivate();
  });

  it("registers all expected commands and does NOT create status bar by default", () => {
    activate(context);

    const registeredCommandIds = registerCommandMock.mock.calls.map(
      (call: any[]) => call[0],
    );
    expect(registeredCommandIds).toEqual(
      expect.arrayContaining(ALL_COMMAND_IDS),
    );
    expect(registeredCommandIds).toHaveLength(ALL_COMMAND_IDS.length);

    // چون مقدار پیش‌فرض enableStatusBar برابر false است، نباید ساخته شود
    expect(createStatusBarItemMock).not.toHaveBeenCalled();

    // لیسنر تغییر تنظیمات باید ثبت شده باشد
    expect(onDidChangeConfigMock).toHaveBeenCalledTimes(1);

    // همه‌ی command disposable ها + fs provider + لیسنرهای دیگر باید در
    // subscriptions قرار گرفته باشند
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(
      ALL_COMMAND_IDS.length + 2,
    );
  });

  it("registers a FileSystemProvider (not a TextDocumentContentProvider) on the 'gitcme' scheme", () => {
    activate(context);

    expect(registerFsProviderMock).toHaveBeenCalledTimes(1);
    const [scheme, provider, options] = registerFsProviderMock.mock.calls[0];
    expect(scheme).toBe("gitcme");
    expect(provider).toBeDefined();
    // FileSystemProvider ما باید متد writeFile داشته باشد (یعنی قابل ویرایش است)
    expect(typeof provider.writeFile).toBe("function");
    expect(options).toEqual(expect.objectContaining({ isCaseSensitive: true }));

    expect(registerTextDocProviderMock).not.toHaveBeenCalled();
  });

  it("creates status bar when enableStatusBar is true", () => {
    getConfigurationMock.mockReturnValue(configWith(true));

    activate(context);

    expect(createStatusBarItemMock).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Left,
      90,
    );

    const statusBarItem = createStatusBarItemMock.mock.results[0].value;
    expect(statusBarItem.text).toBe("$(edit) Commit Msg");
    expect(statusBarItem.command).toBe("gitCommitMessageEditor.open");
    expect(statusBarItem.show).toHaveBeenCalled();
    expect(context.subscriptions).toContain(statusBarItem);
  });

  it("toggles the status bar on and off when the setting changes", () => {
    getConfigurationMock.mockReturnValue(configWith(false));
    activate(context);
    expect(createStatusBarItemMock).not.toHaveBeenCalled();

    // شبیه‌سازی تغییر تنظیمات به true
    const changeListener = onDidChangeConfigMock.mock.calls[0][0];
    getConfigurationMock.mockReturnValue(configWith(true));
    changeListener({
      affectsConfiguration: (key: string) =>
        key === "gitCommitMessageEditor.enableStatusBar",
    });

    expect(createStatusBarItemMock).toHaveBeenCalledTimes(1);
    const statusBarItem = createStatusBarItemMock.mock.results[0].value;

    // حالا برعکس: خاموش کردن
    getConfigurationMock.mockReturnValue(configWith(false));
    changeListener({
      affectsConfiguration: (key: string) =>
        key === "gitCommitMessageEditor.enableStatusBar",
    });

    expect(statusBarItem.dispose).toHaveBeenCalled();
  });

  it("ignores unrelated configuration changes", () => {
    activate(context);
    const changeListener = onDidChangeConfigMock.mock.calls[0][0];

    getConfigurationMock.mockReturnValue(configWith(true));
    changeListener({
      affectsConfiguration: (key: string) => key === "some.other.setting",
    });

    expect(createStatusBarItemMock).not.toHaveBeenCalled();
  });

  it("deactivate does not throw when no status bar item exists", () => {
    expect(() => deactivate()).not.toThrow();
  });

  it("deactivate disposes the status bar item if one was created", () => {
    getConfigurationMock.mockReturnValue(configWith(true));

    activate(context);
    const statusBarItem = createStatusBarItemMock.mock.results[0].value;

    deactivate();

    expect(statusBarItem.dispose).toHaveBeenCalled();
  });
});
