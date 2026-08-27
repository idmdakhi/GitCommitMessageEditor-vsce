# نقشه راه یک «ویرایشگر پیام کامیت» مدرن (تجمیع سه افزونه)

هدف: ادغام بهترین قابلیت‌های هر سه در یک افزونه‌ی واحد و مدرن.

---

## فاز ۰ — زیرساخت پایه

- [ ] اسکلت افزونه‌ی VS Code (TypeScript + esbuild/webpack)
- [ ] یکپارچه‌سازی با پنل Source Control (آیکون Edit روی مخزن)
- [ ] دستور Command Palette: «Open Commit Message Editor»
- [ ] پشتیبانی از چند مخزن باز هم‌زمان + به‌خاطرسپاری مخزن انتخابی در `workspaceState`
- [ ] حالت «VS Code as Git Editor» (ویرایش مستقیم `COMMIT_EDITMSG` بدون فایل واقعی، با VFS)
- [ ] ساخت پکیج `.vsix` و انتشار در Marketplace

## فاز ۱ — فرم ساخت پیام (پایه‌ی Conventional Commits)

- [ ] قالب پیش‌فرض: `type(scope): subject` + body + footer
- [ ] فیلد `type` به‌صورت dropdown با لیست کامل (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert, wip, initial)
- [ ] فیلد `scope` (متنی)
- [ ] فیلد `subject`
- [ ] فیلد `body` (چندخطی)
- [ ] فیلد شرطی `BREAKING CHANGE` (چک‌باکس فعال‌سازی)
- [ ] فیلدهای ارجاع: `Resolves` / `Refs` / `See also` / `Closes` (ورودی چندتایی ایشو، افزودن خودکار `#`)
- [ ] فیلدهای امضا: `Signed-off-by`, `Co-authored-by`, `Reviewed-by`, `Tested-by`, `Acked-by`, `Reported-by`
- [ ] فقط فیلدهای پرشده در پیام نهایی درج شوند
- [ ] پیش‌نمایش زنده‌ی پیام کامیت
- [ ] دکمه «درج در Source Control Input Box»
- [ ] دکمه «کپی به کلیپ‌بورد»
- [ ] دکمه «بازنشانی فرم»

## فاز ۲ — قابلیت تنظیم/سفارشی‌سازی فرم (از بندرا)

- [ ] Configuration Editor گرافیکی برای تعریف قالب‌های دلخواه
- [ ] فرمت پیکربندی قابل حمل (JSON) با Schema رسمی برای اعتبارسنجی در VS Code
- [ ] `staticTemplate` (نمای متنی خام) و `dynamicTemplate` (نمای فرم) به‌صورت جدا
- [ ] تعریف Token/فیلد دلخواه با انواع: text, boolean, enum
- [ ] ویژگی‌های هر Token: label, prefix, suffix, description, multiline, monospace, lines/maxLines, maxLength, maxLineLength, options (برای enum)، multiple/separator/combobox
- [ ] Export/Import پیکربندی + ذخیره در تنظیمات User یا Workspace
- [ ] چند قالب آماده‌ی نمونه: Default (Conventional Commits)، Gitmoji، Angular، ساده
- [ ] سوییچ سریع بین قالب‌ها از منوی بالای فرم
- [ ] تب اختصاصی با Textarea بزرگ برای نوشتن آزاد پیام

## فاز ۳ — IntelliSense داخل ادیتور متنی (از phoihos)

- [ ] فعال‌سازی Autocomplete با `Ctrl+Space` یا تایپ مستقیم
- [ ] تکمیل خودکار `type` بر اساس Conventional Commits
- [ ] تکمیل خودکار `scope`:
  - [ ] مدیریت لیست Scope های کاربر (ذخیره در `.vscode/settings.json`)
  - [ ] استخراج خودکار Scope از تاریخچه‌ی کامیت‌های موجود (grep از لاگ)
  - [ ] گزینه‌ی «ایجاد Scope جدید» در لیست پیشنهادها
- [ ] تکمیل Gitmoji با تریگر کاراکتر `:` (فیلتر بر اساس نوع کامیت انتخاب‌شده)
- [ ] تکمیل `Footer Type` (Closes, Refs, BREAKING CHANGE)
- [ ] تکمیل شماره ایشو برای `Closes` با تریگر `#` — دریافت از GitHub API (با احراز هویت برای افزایش Rate Limit)
- [ ] تکمیل کامیت برای `Refs` از تاریخچه‌ی محلی مخزن
- [ ] Hover روی Type/Scope/Emoji در خط اول و روی Type/Issues/Commits در فوترها
- [ ] CodeLens «Recent commits...» برای انتخاب سریع پیام کامیت قبلی (با شورتکات اختصاصی)
- [ ] رعایت خودکار قاعده‌ی Git 50/72 (ruler در تنظیمات ادیتور)

## فاز ۴ — هوش مصنوعی و اتوماسیون هوشمند

- [ ] «پیش‌نویس با هوش مصنوعی»: خواندن diff تغییرات stage‌شده و پیشنهاد type/scope/subject/body
- [ ] استفاده از API رسمی `vscode.lm` (سازگار با GitHub Copilot Chat) بدون نیاز به کلید API جدا
- [ ] پیام خطای واضح در صورت غیرفعال بودن Copilot Chat
- [ ] تشخیص شماره‌ی ایشو از نام برنچ (مثل `JIRA-123`, `feature/456`) و افزودن سریع به Resolves
- [ ] پیشنهاد Scope از روی مسیر فایل‌های Stage‌شده (`git diff --staged --name-only`)
- [ ] دکمه‌ی «تکمیل خودکار پیشنهادها» که فقط فیلدهای خالی را پر می‌کند

## فاز ۵ — تجربه کاربری و بهره‌وری

- [ ] داشبورد وضعیت چسبان (sticky) بالای فرم:
  - [ ] چیپ وضعیت هر بخش (سبز=کامل / قرمز=الزامی‌وناقص / خاکستری=اختیاری)
  - [ ] کلیک روی چیپ → فوکوس روی همان فیلد
  - [ ] شمارنده پیشرفت («X از N بخش»)
  - [ ] نشان تعداد هشدارها با لینک مستقیم به فیلد مربوطه
- [ ] اعتبارسنجی بلادرنگ:
  - [ ] شمارنده کاراکتر برای subject با حداکثر قابل تنظیم
  - [ ] هشدار خطوط طولانی در body
  - [ ] Style Lint: هشدار برای نقطه پایانی، حرف بزرگ ابتدایی، فعل گذشته به‌جای امری
- [ ] به‌خاطرسپاری پرکاربردترین مقادیر type/scope به‌صورت چیپ‌های کلیک‌پذیر
- [ ] مرور و انتخاب از لیست کامیت‌های اخیر (پرکردن خودکار فرم در صورت تطابق با الگو)
- [ ] باز کردن فرم/داشبورد در یک تب کامل وسط صفحه (علاوه بر Sidebar)
- [ ] هماهنگی state بین نمونه‌ی Sidebar و تب کامل از طریق workspaceState/globalState
- [ ] آیتم نوار وضعیت (Status Bar) برای دسترسی سریع
- [ ] ذخیره/بازیابی پیش‌نویس فرم حتی بعد از بستن VS Code (`workspaceState` + `webview.getState`)

## فاز ۶ — عملیات گیت مکمل

- [ ] ویرایش (Amend) آخرین کامیت: بارگذاری پیام قبلی در فرم + جایگزینی با تأیید مودال
- [ ] واگرد (Undo) آخرین «درج در Source Control» با بازگرداندن مقدار قبلی input box
- [ ] دکمه‌ی «قالب‌بندی خودکار body» (word-wrap بر اساس maxLineLength، حفظ پاراگراف‌ها)
- [ ] ثبت قالب به‌عنوان `commit.template` رسمی گیت (ساخت `.gitmessage` + `git config commit.template`) برای استفاده حتی از ترمینال

## فاز ۷ — تنظیمات و شخصی‌سازی سراسری

- [ ] `types` قابل تنظیم از `settings.json`
- [ ] `autoFillSignedOffBy` (پرکردن خودکار از `git config user.name/email`)
- [ ] `detectIssueFromBranch`
- [ ] `maxSubjectLength`, `maxLineLength`
- [ ] `rememberFrequentValues`
- [ ] `showRecentCommits` (+ `maxItems`)
- [ ] `emojiPrefix` (فعال‌سازی پیش‌فرض Gitmoji)
- [ ] `editor.keepAfterSave` (بستن یا نبستن تب بعد از ذخیره)
- [ ] `intelliSense.completion.logScopes.enabled`
- [ ] `intelliSense.completion.issues.pageSize`
- [ ] `intelliSense.hover.enabled`

## فاز ۸ — چندزبانگی و مستندسازی

- [ ] i18n کامل رابط کاربری (فارسی + انگلیسی حداقل)
- [ ] مستندات README کامل با اسکرین‌شات‌ها و GIF
- [ ] JSON Schema عمومی برای فایل پیکربندی قابل حمل
- [ ] نمونه‌قالب‌های آماده (Default / Gitmoji / Angular / زبان‌های دیگر مثل چینی)

## فاز ۹ — قابلیت‌های آینده (اختیاری / نیاز به بررسی بیشتر)

- [ ] آمار و نمودار کامیت‌ها (نیازمند Chart.js در یک Webview جدا)
- [ ] نمایش وضعیت CI/CD (نیازمند اتصال به API سرویس‌های CI و مدیریت توکن)
- [ ] اجرای خودکار pre-commit hookها — **توصیه: انجام نشود**، بهتر است از طریق Husky/lint-staged مدیریت شود تا کنترل کاربر حفظ شود

---

## اولویت‌بندی پیشنهادی برای MVP نسخه‌ی مدرن

1. فاز ۰ و ۱ (زیرساخت + فرم پایه‌ی Conventional Commits)
2. فاز ۲ (Config Editor قابل تنظیم — تمایز اصلی نسبت به رقبای ساده‌تر)
3. فاز ۳ (IntelliSense در ادیتور واقعی — نقطه‌قوت phoihos که در بقیه نیست)
4. فاز ۵ (داشبورد وضعیت + اعتبارسنجی — تجربه‌ی کاربری متمایزکننده)
5. فاز ۴ (AI Draft — قابلیت جذاب برای معرفی نسخه‌ی ۱.۰)
6. فاز ۶، ۷، ۸ به‌صورت تدریجی در نسخه‌های بعدی
7. فاز ۹ فقط در صورت تقاضای واقعی کاربران
