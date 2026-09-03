// tests/unit/extension.test.ts
import * as path from "path";
import { activate, deactivate } from "../../src/extension";
import * as vscode from "vscode";
import { CommitEditorPanel } from "../../src/panels/CommitEditorPanel";
import { t } from "../../src/i18n";

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
//
// نکته‌ی سوم: activate() اکنون I18nManager.getInstance().load(extensionPath)
// را فراخوانی می‌کند که با fs.readFileSync فایل l10n/<lang>.json را می‌خواند.
// به‌جای یک extensionPath ساختگی، مسیر واقعی ریشه‌ی ریپو را می‌دهیم تا هم از
// warning بی‌مورد در خروجی تست جلوگیری شود و هم واقعاً بررسی شود که
// l10n/en.json به‌درستی بارگذاری می‌شود.
const REPO_ROOT = path.resolve(__dirname, "../..");

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
    extensionPath: REPO_ROOT,
    workspaceState: {
      get: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

// activate() اکنون سه لیسنر onDidChangeConfiguration ثبت می‌کند، نه یکی:
// (۱) scmTitleCommand، (۲) language، (۳) enableStatusBar — به همین ترتیب.
// این ایندکس‌ها برای پیدا کردن لیسنر درست در تست‌های زیر استفاده می‌شوند.
const SCM_TITLE_LISTENER_INDEX = 0;
const LANGUAGE_LISTENER_INDEX = 1;
const STATUS_BAR_LISTENER_INDEX = 2;

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

    // سه لیسنر تغییر تنظیمات باید ثبت شده باشند: scmTitleCommand، language،
    // enableStatusBar
    expect(onDidChangeConfigMock).toHaveBeenCalledTimes(3);

    // همه‌ی command disposable ها + fs provider + ۳ لیسنر تنظیمات + لیسنر
    // ویرایشگرهای قابل مشاهده باید در subscriptions قرار گرفته باشند
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(
      ALL_COMMAND_IDS.length + 5,
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

    // شبیه‌سازی تغییر تنظیمات به true — لیسنر enableStatusBar سومین
    // لیسنری است که ثبت می‌شود
    const changeListener =
      onDidChangeConfigMock.mock.calls[STATUS_BAR_LISTENER_INDEX][0];
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
    const changeListener =
      onDidChangeConfigMock.mock.calls[STATUS_BAR_LISTENER_INDEX][0];

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

  it("syncs the gitcme.scmTitleCommand context key on activation", () => {
    const cfg = {
      get: jest.fn().mockReturnValue("amend"),
      update: jest.fn(),
    };
    getConfigurationMock.mockReturnValue(cfg);

    activate(context);

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "gitcme.scmTitleCommand",
      "amend",
    );
  });

  it("re-syncs the scmTitleCommand context key when that setting changes", () => {
    activate(context);
    (vscode.commands.executeCommand as jest.Mock).mockClear();

    const changeListener =
      onDidChangeConfigMock.mock.calls[SCM_TITLE_LISTENER_INDEX][0];

    getConfigurationMock.mockReturnValue({
      get: jest.fn().mockReturnValue("gitEditor"),
      update: jest.fn(),
    });
    changeListener({
      affectsConfiguration: (key: string) =>
        key === "gitCommitMessageEditor.scmTitleCommand",
    });

    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
      "setContext",
      "gitcme.scmTitleCommand",
      "gitEditor",
    );
  });

  it("loads the real l10n dictionary on activation (English by default)", () => {
    activate(context);

    // اگر l10n/en.json به‌درستی از extensionPath خوانده شده باشد، t() باید
    // متن واقعی انگلیسی را برگرداند، نه صرفاً کلید را (که یعنی بارگذاری
    // ناموفق بوده است).
    expect(t("title")).toBe("Commit Message Editor");
    expect(t("toolbar.insert")).not.toBe("toolbar.insert");
  });

  it("reloads the dictionary and refreshes any open panel when the language setting changes", () => {
    const refreshSpy = jest
      .spyOn(CommitEditorPanel, "refreshIfOpen")
      .mockImplementation(() => {});

    activate(context);
    const changeListener =
      onDidChangeConfigMock.mock.calls[LANGUAGE_LISTENER_INDEX][0];

    changeListener({
      affectsConfiguration: (key: string) =>
        key === "gitCommitMessageEditor.language",
    });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    refreshSpy.mockRestore();
  });
});
