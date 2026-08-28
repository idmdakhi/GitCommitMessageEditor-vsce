// tests/unit/extension.test.ts
import { activate, deactivate } from "../../src/extension";
import * as vscode from "vscode";

// اطمینان از استفاده از ماک vscode (اگر moduleNameMapper تنظیم شده باشد)
jest.mock("vscode");

describe("extension activate/deactivate", () => {
  let context: any;
  let registerSpy: jest.SpyInstance;
  let createStatusBarSpy: jest.SpyInstance;
  let onDidChangeConfigSpy: jest.SpyInstance;

  beforeEach(() => {
    // پاک کردن همه ماک‌ها بین تست‌ها
    jest.clearAllMocks();

    // تنظیم پیش‌فرض: enableStatusBar = false
    const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;
    getConfigMock.mockReturnValue({
      get: jest.fn().mockReturnValue(false), // false برای enableStatusBar
      update: jest.fn(),
    });

    context = {
      subscriptions: [],
      extensionPath: "/fake/ext",
    };

    registerSpy = jest.spyOn(vscode.commands, "registerCommand");
    createStatusBarSpy = jest.spyOn(vscode.window, "createStatusBarItem");
    onDidChangeConfigSpy = jest.spyOn(
      vscode.workspace,
      "onDidChangeConfiguration",
    );
  });

  afterEach(() => {
    registerSpy.mockRestore();
    createStatusBarSpy.mockRestore();
    onDidChangeConfigSpy.mockRestore();
  });

  it("registers all expected commands and does NOT create status bar by default", () => {
    activate(context);

    // بررسی ثبت دستورات
    const registeredCommandIds = registerSpy.mock.calls.map((call) => call[0]);
    expect(registeredCommandIds).toEqual(
      expect.arrayContaining([
        "gitCommitMessageEditor.open",
        "gitCommitMessageEditor.openInNewTab",
        "gitCommitMessageEditor.openSettings",
        "gitCommitMessageEditor.openConfigEditor",
        "gitCommitMessageEditor.createProjectConfig",
        "gitCommitMessageEditor.amendLast",
        "gitCommitMessageEditor.undoLastInsert",
      ]),
    );

    // بررسی اینکه Status Bar ایجاد نشده (چون مقدار پیش‌فرض false است)
    expect(createStatusBarSpy).not.toHaveBeenCalled();

    // بررسی اینکه event listener برای تغییر تنظیمات ثبت شده
    expect(onDidChangeConfigSpy).toHaveBeenCalled();

    // تعداد subscriptions باید شامل حداقل یک event listener باشد
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(1);
  });

  // it("creates status bar when enableStatusBar is true", () => {
  //   // بازنویسی ماک برای برگرداندن true
  //   const getConfigMock = vscode.workspace.getConfiguration as jest.Mock;
  //   getConfigMock.mockReturnValue({
  //     get: jest.fn().mockReturnValue(true),
  //     update: jest.fn(),
  //   });

  //   activate(context);

  //   expect(createStatusBarMock).toHaveBeenCalledWith(
  //     vscode.StatusBarAlignment.Left,
  //     90,
  //   );
  //   const statusBarItem = createStatusBarMock.mock.results[0].value;
  //   expect(statusBarItem.show).toHaveBeenCalled();
  //   expect(context.subscriptions).toContain(statusBarItem);
  // });

  it("deactivate does not throw", () => {
    expect(() => deactivate()).not.toThrow();
  });
});
