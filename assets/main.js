// @ts-nocheck
(function () {
  const vscode = acquireVsCodeApi();
  const app = document.getElementById("app");

  /** @type {Record<string, string | boolean>} */
  let values = {};

  /** @type {Record<string, boolean>} */
  let conditionalEnabled = {};

  let config = null;
  let settings = {};
  let recentCommits = [];
  let activeConfigName = "";
  let configSource = "";
  let hasProjectConfig = false;

  // ===== Free‑form tab (Phase 2 todo: dedicated tab with a large textarea) =====
  // "form"      — the structured, token-based form (existing behaviour)
  // "freeform"  — a single large textarea; buildMessage() returns this text verbatim
  let editorMode = "form";
  let freeformText = "";

  // If enabled, selecting any Type will automatically set the corresponding emoji in Gitmoji (default: enabled)
  let autoGitmoji = true;

  // ===== Support for multiple repositories =====
  let repos = [];
  let currentRepoIndex = 0;

  let repoInfo = {
    name: "unknown",
    branch: "detached",
    stagedCount: 0,
  };

  // Prevent multiple registrations of global listeners
  let globalListenersBound = false;

  // Status of ongoing operations
  const pendingActions = {
    autoSuggest: false,
    aiDraft: false,
  };

  // ===== Receive VS Code messages =====
  window.addEventListener("message", handleMessage);

  function handleMessage(event) {
    const msg = event.data || {};

    switch (msg.type) {
      case "init":
        initializeState(msg);
        render();
        break;

      case "repoInfo":
        updateRepoState(msg);
        renderRepoBar();
        break;

      case "repoChanged":
        handleRepoChanged(msg);
        break;

      case "autoSuggestions":
        pendingActions.autoSuggest = false;
        applyAutoSuggestions(msg.suggestions || {});
        hideSpinner("btn-autofill", "⚡ Suggestions");
        break;

      case "aiDraftResult":
        pendingActions.aiDraft = false;
        applyAiDraft(msg.draft || {});
        hideSpinner("btn-ai", "✨ AI Draft");
        break;

      case "aiDraftError":
        pendingActions.aiDraft = false;
        showAiStatus(msg.message || "AI draft failed.", true);
        hideSpinner("btn-ai", "✨ AI Draft");
        break;

      case "loadRawMessage":
        loadRawIntoSubjectBody(msg.message || "");
        break;

      case "gitIdentityResult":
        applyGitIdentityToSignedOffBy(msg.value || "", msg.message || "");
        break;

      case "openAsGitEditor":
        vscode.commands.executeCommand(
          "gitCommitMessageEditor.openAsGitEditor",
        );
        break;

      case "openSettings":
        vscode.commands.executeCommand("gitCommitMessageEditor.openSettings");
        break;

      default:
        break;
    }
  }

  function t(key) {
    const parts = key.split(".");
    let result = i18n;
    for (const part of parts) {
      if (result && typeof result === "object" && result[part] !== undefined) {
        result = result[part];
      } else {
        return key;
      }
    }
    return typeof result === "string" ? result : key;
  }

  function initializeState(msg) {
    config = msg.config || null;
    const defaultEditorMode = msg.defaultEditorMode || "form";
    activeConfigName = msg.activeConfigName || config?.name || "";
    configSource = msg.configSource || "";
    hasProjectConfig = !!msg.hasProjectConfig;
    i18n = msg.i18n || {};

    settings = {
      ...msg.settings,
      scopes: Array.isArray(msg.settings?.scopes) ? msg.settings.scopes : [],
      types: Array.isArray(msg.settings?.types) ? msg.settings.types : [],
      autoGitmoji:
        msg.settings?.autoGitmoji !== undefined
          ? msg.settings.autoGitmoji
          : true,
      rememberFrequentTypes:
        msg.settings?.rememberFrequentTypes !== undefined
          ? msg.settings.rememberFrequentTypes
          : true,
      rememberFrequentScopes:
        msg.settings?.rememberFrequentScopes !== undefined
          ? msg.settings.rememberFrequentScopes
          : true,
      frequentTypes: Array.isArray(msg.settings?.frequentTypes)
        ? msg.settings.frequentTypes
        : [],
      frequentScopes: Array.isArray(msg.settings?.frequentScopes)
        ? msg.settings.frequentScopes
        : [],
    };

    if (msg.settings?.emojiPrefix) {
      settings.autoGitmoji = true;
    }
    recentCommits = Array.isArray(msg.recentCommits) ? msg.recentCommits : [];

    if (msg.draft) {
      values = msg.draft.values || {};
      conditionalEnabled = msg.draft.conditionalEnabled || {};
      autoGitmoji =
        typeof msg.draft.autoGitmoji === "boolean"
          ? msg.draft.autoGitmoji
          : true;
      editorMode = msg.draft.editorMode === "freeform" ? "freeform" : "form";
      freeformText =
        typeof msg.draft.freeformText === "string"
          ? msg.draft.freeformText
          : "";
      if (!msg.draft.editorMode) {
        editorMode = defaultEditorMode === "freeform" ? "freeform" : "form";
      }
    } else {
      values = {};
      conditionalEnabled = {};
      autoGitmoji = settings.autoGitmoji;
      editorMode = "form";
      freeformText = "";
      editorMode = defaultEditorMode === "freeform" ? "freeform" : "form";
      freeformText = "";
    }

    updateRepoState(msg.repoInfo || {});
    ensureEnabledForFilledOptionals();
  }

  function updateRepoState(info) {
    repos = Array.isArray(info.repos) ? info.repos : [];

    const requestedIndex = Number(info.currentIndex);

    currentRepoIndex =
      Number.isInteger(requestedIndex) &&
      requestedIndex >= 0 &&
      requestedIndex < repos.length
        ? requestedIndex
        : 0;

    repoInfo = info.currentInfo ||
      repos[currentRepoIndex] || {
        name: "unknown",
        branch: "detached",
        stagedCount: 0,
      };
  }

  function handleRepoChanged(msg) {
    if (!msg.success) {
      return;
    }

    vscode.postMessage({
      type: "ready",
    });
  }

  // ===== Request initial information =====
  vscode.postMessage({
    type: "ready",
  });

  // ===== Helpers =====
  function isCollapsible(token) {
    if (!token) return false;
    if (token.required) return false;
    if (token.type === "boolean") return false;

    return true;
  }

  function isFieldEnabled(token) {
    if (!token) return false;

    if (!isCollapsible(token)) {
      return true;
    }

    return !!conditionalEnabled[token.name];
  }

  function ensureEnabledForFilledOptionals() {
    if (!config?.tokens) return;

    for (const token of config.tokens) {
      if (!isCollapsible(token)) continue;

      const value = values[token.name];

      const hasValue =
        value !== undefined && value !== null && String(value).trim() !== "";

      if (hasValue) {
        conditionalEnabled[token.name] = true;
      }
    }
  }

  function findToken(name) {
    return config?.tokens?.find((token) => token.name === name);
  }

  function fieldValue(name) {
    const value = values[name];

    return value === undefined || value === null ? "" : String(value);
  }

  function setValue(name, value) {
    values[name] = value;
    saveDraft();
  }

  function saveDraft() {
    vscode.postMessage({
      type: "saveDraft",
      draft: {
        values,
        conditionalEnabled,
        autoGitmoji,
        editorMode,
        freeformText,
      },
    });
  }

  function issueList(raw) {
    return String(raw || "")
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => (item.startsWith("#") ? item : `#${item}`))
      .join(", ");
  }

  // ===== Suggestions / AI =====

  function applyAutoSuggestions(suggestions) {
    if (!suggestions || typeof suggestions !== "object") {
      return;
    }

    let changed = false;

    for (const [key, suggestion] of Object.entries(suggestions)) {
      const token = findToken(key);

      if (!token) continue;

      const currentValue = fieldValue(key);

      if (!currentValue.trim() && suggestion != null) {
        values[key] = suggestion;

        if (isCollapsible(token)) {
          conditionalEnabled[key] = true;
        }

        changed = true;
      }
    }

    if (changed) {
      saveDraft();
      render();
    }
  }

  // Response to "fetch from Git" request for the Signed-off-by field
  function applyGitIdentityToSignedOffBy(value, errorMessage) {
    const gitIdentityBtn = document.getElementById("fetch-git-identity");

    if (gitIdentityBtn) {
      gitIdentityBtn.disabled = false;
      gitIdentityBtn.textContent = "⇩ Git";
    }

    if (!value) {
      showAiStatus(
        errorMessage || "Could not read user.name/user.email from Git config.",
        true,
      );
      return;
    }

    const token = findToken("signedOffBy");

    if (!token) return;

    values.signedOffBy = value;
    conditionalEnabled.signedOffBy = true;

    saveDraft();
    render();
  }

  function applyAiDraft(draft) {
    let changed = false;

    for (const key of ["type", "scope", "subject", "body"]) {
      const token = findToken(key);

      if (!token) continue;

      if (
        draft[key] !== undefined &&
        draft[key] !== null &&
        String(draft[key]).trim() !== ""
      ) {
        values[key] = draft[key];

        if (isCollapsible(token)) {
          conditionalEnabled[key] = true;
        }

        changed = true;
      }
    }

    if (changed) {
      saveDraft();
    }

    render();

    showAiStatus(
      changed
        ? "AI draft applied."
        : "Active template has no compatible fields to apply.",
      !changed,
    );
  }

  function loadRawIntoSubjectBody(raw) {
    // اگر تب Free‑form فعال است، متن خام مستقیماً در همان Textarea قرار
    // می‌گیرد؛ تجزیه به فیلدهای فرم بی‌فایده است چون فرم در حال حاضر نمایش
    // داده نمی‌شود.
    if (editorMode === "freeform") {
      freeformText = String(raw || "");
      saveDraft();
      render();
      return;
    }

    if (!findToken("subject")) return;

    const lines = String(raw || "").split("\n");

    let header = lines[0] || "";

    // If the first line starts with an emoji (e.g. '✨ feat: ...'), extract it and put it in Gitmoji
    const emojiMatch = header.match(/^(\p{Extended_Pictographic}\uFE0F?)\s+/u);

    if (emojiMatch && findToken("gitmoji")) {
      values.gitmoji = emojiMatch[1];
      conditionalEnabled.gitmoji = true;
      header = header.slice(emojiMatch[0].length);
    }

    const match = header.match(/^([a-z]+)(\(([^)]+)\))?:\s*(.*)$/i);

    if (match && findToken("type")) {
      values.type = match[1];

      if (findToken("scope")) {
        values.scope = match[3] || "";

        if (values.scope) {
          conditionalEnabled.scope = true;
        }
      }

      values.subject = match[4] || "";
    } else {
      values.subject = header;
    }

    // Separate the remaining lines (body + issue references + trailers): lines that start with a known field prefix (e.g. 'Signed-off-by: ', 'Closes: ', etc.) go into that field — not Body
    const restLines = lines.slice(1);

    const prefixTokens = (config.tokens || [])
      .filter(
        (token) =>
          typeof token.prefix === "string" &&
          token.prefix.trim() !== "" &&
          !["type", "subject", "scope"].includes(token.name),
      )
      .sort((a, b) => b.prefix.length - a.prefix.length);

    const bodyLines = [];
    const trailerChunks = {}; // name -> array of matched occurrences (strings)
    let currentTrailerName = null;
    let inTrailerBlock = false;

    restLines.forEach((line) => {
      const trimmedStart = line.replace(/^\s+/, "");

      const matchedToken = prefixTokens.find((token) =>
        trimmedStart.startsWith(token.prefix),
      );

      if (matchedToken) {
        inTrailerBlock = true;
        currentTrailerName = matchedToken.name;

        if (!trailerChunks[currentTrailerName]) {
          trailerChunks[currentTrailerName] = [];
        }

        trailerChunks[currentTrailerName].push(
          trimmedStart.slice(matchedToken.prefix.length).trim(),
        );

        return;
      }

      if (inTrailerBlock) {
        if (line.trim() === "") return; // خط خالی داخل بلوک trailer نادیده گرفته می‌شود

        // ادامه‌ی خط trailer قبلی (مثلاً پاراگراف چندخطی BREAKING CHANGE)
        if (currentTrailerName && trailerChunks[currentTrailerName]?.length) {
          const idx = trailerChunks[currentTrailerName].length - 1;

          trailerChunks[currentTrailerName][idx] += ` ${line.trim()}`;
        }

        return;
      }

      bodyLines.push(line);
    });

    Object.keys(trailerChunks).forEach((name) => {
      const token = findToken(name);

      if (!token) return;

      const occurrences = trailerChunks[name].filter((v) => v !== "");

      if (!occurrences.length) return;

      values[name] = token.perLine
        ? occurrences.join("\n")
        : occurrences.join(", ");

      conditionalEnabled[name] = true;
    });

    if (findToken("body")) {
      const bodyText = bodyLines.join("\n").trim();

      values.body = bodyText;
      conditionalEnabled.body = !!bodyText;
    }

    ensureEnabledForFilledOptionals();

    saveDraft();
    render();
  }

  // Template Engine

  function computeTokenOutput(token) {
    if (!token) return "";

    // اگر «Auto Gitmoji» غیرفعال است، Gitmoji در پیام نهایی درج نمی‌شود
    // (حتی اگر قبلاً مقداری برایش ثبت شده باشد)
    if (token.name === "gitmoji" && !autoGitmoji) {
      return "";
    }

    if (isCollapsible(token) && !conditionalEnabled[token.name]) {
      return "";
    }

    if (token.type === "boolean") {
      const checked = !!values[token.name];

      if (!checked) return "";

      return (token.prefix || "") + (token.value || "") + (token.suffix || "");
    }

    const raw = fieldValue(token.name);

    if (!raw.trim()) {
      return "";
    }

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

  function renderTemplateLine(line) {
    return String(line || "").replace(/\{(\w+)\}/g, (_, name) => {
      const token = findToken(name);

      return token ? computeTokenOutput(token) : "";
    });
  }

  function buildMessage() {
    if (editorMode === "freeform") {
      return trimStrayBlankLines(freeformText);
    }

    if (!config?.template) {
      return "";
    }

    const collected = [];

    for (const templateLine of config.template) {
      if (templateLine.trim() === "") {
        collected.push("");
        continue;
      }

      const rendered = renderTemplateLine(templateLine);

      if (rendered.trim()) {
        collected.push(rendered);
      }
    }

    const output = [];

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

  // ===== Auto-format Body =====
  function formatBody() {
    const token = findToken("body");
    if (!token) {
      showAiStatus("No 'body' field found in the current template.", true);
      return;
    }

    const raw = fieldValue("body");
    if (!raw.trim()) {
      showAiStatus("Body is empty. Nothing to format.", true);
      return;
    }

    const maxLen = settings.maxLineLength || 100;

    // پاراگراف‌ها را بر اساس خطوط خالی جدا می‌کنیم
    const paragraphs = raw.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

    const formattedParagraphs = paragraphs.map((p) => {
      const words = p.split(/\s+/).filter((w) => w.length > 0);
      const lines = [];
      let currentLine = [];
      let currentLength = 0;

      for (const word of words) {
        if (word.length > maxLen) {
          if (currentLine.length > 0) {
            lines.push(currentLine.join(" "));
            currentLine = [];
            currentLength = 0;
          }
          lines.push(word);
          continue;
        }

        const space = currentLine.length > 0 ? 1 : 0;
        if (currentLength + space + word.length <= maxLen) {
          currentLine.push(word);
          currentLength += space + word.length;
        } else {
          lines.push(currentLine.join(" "));
          currentLine = [word];
          currentLength = word.length;
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine.join(" "));
      }
      return lines.join("\n");
    });

    const newBody = formattedParagraphs.join("\n\n");

    values.body = newBody;
    if (isCollapsible(token)) {
      conditionalEnabled.body = true;
    }

    saveDraft();
    render();
    showAiStatus("Body formatted successfully.", false);
  }

  // یک پیام آزاد را برای درج نهایی آماده می‌کند: خطوط خالی ابتدای پیام
  // (که هرگز بخشی از subject نیستند) و فاصله‌ی خالی انتهای پیام حذف
  // می‌شوند؛ خطوط خالی داخل پیام (مثلاً بین پاراگراف‌های body) دست‌نخورده
  // باقی می‌مانند چون کاربر آگاهانه آن‌ها را نوشته است.
  function trimStrayBlankLines(text) {
    const lines = String(text || "").split("\n");

    while (lines.length && lines[0].trim() === "") {
      lines.shift();
    }

    while (lines.length && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    if (lines.length) {
      // Leading spaces/tabs on the subject line itself (as opposed to a
      // blank line before it) are almost certainly accidental.
      lines[0] = lines[0].replace(/^[ \t]+/, "");
    }

    return lines.join("\n");
  }

  // Validation

  function computeWarnings() {
    if (editorMode === "freeform") {
      return computeFreeformWarnings();
    }

    if (!config?.tokens) return [];

    const warnings = [];

    const subjectToken = findToken("subject");

    if (subjectToken && isFieldEnabled(subjectToken)) {
      const subject = fieldValue("subject");

      const maxSubject =
        subjectToken.maxLength || settings.maxSubjectLength || 72;

      if (subject.length > maxSubject) {
        warnings.push({
          field: "subject",
          message: `Subject is longer than ${maxSubject} characters.`,
        });
      }

      if (/[.]\s*$/.test(subject.trim())) {
        warnings.push({
          field: "subject",
          message: "Subject should not end with a period.",
        });
      }

      if (subject.trim() && /^[A-Z]/.test(subject.trim())) {
        warnings.push({
          field: "subject",
          message: "Subject should not start with a capital letter.",
        });
      }

      if (
        /^(added|fixed|changed|removed|updated|created|deleted)\b/i.test(
          subject.trim(),
        )
      ) {
        warnings.push({
          field: "subject",
          message: "Use imperative mood (add, not added).",
        });
      }
    }

    for (const token of config.tokens) {
      if (!isFieldEnabled(token)) continue;

      const value = fieldValue(token.name);

      if (
        token.multiline &&
        token.maxLineLength &&
        value.split("\n").some((line) => line.length > token.maxLineLength)
      ) {
        warnings.push({
          field: token.name,
          message:
            `One or more lines in “${token.label}” exceed ` +
            `${token.maxLineLength} characters.`,
        });
      }

      if (token.required) {
        const hasValue =
          token.type === "boolean" ? !!values[token.name] : value.trim() !== "";

        if (!hasValue) {
          warnings.push({
            field: token.name,
            message: `Required field “${token.label}” is empty.`,
          });
        }
      }
    }

    return warnings;
  }

  // همان قراردادهای Git 50/72 که برای فیلد subject در حالت فرم چک می‌شوند
  // (طول، بدون نقطه‌ی پایانی، بدون حرف بزرگ ابتدایی، حالت امری) روی خط
  // اول پیام آزاد هم اعمال می‌شوند؛ به‌علاوه یک هشدار برای طول خطوط body و
  // فاصله‌ی خالی میان subject و body.
  function computeFreeformWarnings() {
    const text = freeformText || "";

    if (!text.trim()) {
      return [
        {
          field: "freeform-message",
          message: "Commit message is empty.",
        },
      ];
    }

    const warnings = [];
    const lines = text.split("\n");
    const subject = lines[0] || "";
    const maxSubject = settings.maxSubjectLength || 72;

    if (subject.length > maxSubject) {
      warnings.push({
        field: "freeform-message",
        message: `First line is longer than ${maxSubject} characters.`,
      });
    }

    if (/[.]\s*$/.test(subject.trim())) {
      warnings.push({
        field: "freeform-message",
        message: "First line should not end with a period.",
      });
    }

    if (subject.trim() && /^[A-Z]/.test(subject.trim())) {
      warnings.push({
        field: "freeform-message",
        message: "First line should not start with a capital letter.",
      });
    }

    if (
      /^(added|fixed|changed|removed|updated|created|deleted)\b/i.test(
        subject.trim(),
      )
    ) {
      warnings.push({
        field: "freeform-message",
        message: "Use imperative mood (add, not added).",
      });
    }

    if (lines.length > 1 && lines[1].trim() !== "") {
      warnings.push({
        field: "freeform-message",
        message: "Leave a blank line between the first line and the body.",
      });
    }

    const maxLine = settings.maxLineLength || 100;

    if (lines.slice(2).some((line) => line.length > maxLine)) {
      warnings.push({
        field: "freeform-message",
        message: `One or more lines in the body exceed ${maxLine} characters.`,
      });
    }

    return warnings;
  }

  function validateField(token) {
    if (!token) return;

    const element = document.getElementById(`f-${token.name}`);

    if (!element) return;

    const fieldDiv = element.closest(".field");

    if (!fieldDiv) return;

    let valid = true;
    let message = "";

    if (token.required) {
      const value =
        token.type === "boolean"
          ? !!values[token.name]
          : fieldValue(token.name).trim();

      if (!value) {
        valid = false;
        message = `“${token.label}” is required.`;
      }
    }

    if (valid && token.maxLength && token.type !== "boolean") {
      const length = fieldValue(token.name).length;

      if (length > token.maxLength) {
        valid = false;

        message = `Exceeds max length (${length}/${token.maxLength}).`;
      }
    }

    if (valid && token.name === "subject") {
      const subject = fieldValue(token.name).trim();

      if (subject) {
        if (/[.]\s*$/.test(subject)) {
          valid = false;
          message = "Subject should not end with a period.";
        } else if (/^[A-Z]/.test(subject)) {
          valid = false;
          message = "Subject should not start with a capital letter.";
        } else if (
          /^(added|fixed|changed|removed|updated|created|deleted)\b/i.test(
            subject,
          )
        ) {
          valid = false;
          message = "Use imperative mood (add, not added).";
        }
      }
    }

    fieldDiv.classList.toggle("invalid", !valid);

    let messageElement = fieldDiv.querySelector(".validation-msg");

    if (!messageElement && !valid) {
      messageElement = document.createElement("div");

      messageElement.className = "validation-msg";

      fieldDiv.appendChild(messageElement);
    }

    if (messageElement) {
      messageElement.textContent = message;

      messageElement.style.display = valid ? "none" : "block";
    }
  }

  // UI Helpers

  function showAiStatus(text, isError = false) {
    const element = document.getElementById("ai-status");
    if (!element) return;
    const translated = t(text) !== text ? t(text) : text;
    element.textContent = translated;
    element.className = `ai-status${isError ? " error" : ""}`;
  }

  function renderRepoBar() {
    const existing = document.querySelector(".repo-info-bar");

    if (existing) {
      existing.remove();
    }

    if (!repos.length) {
      return;
    }

    const bar = document.createElement("div");

    bar.className = "repo-info-bar";

    const staged =
      repoInfo.stagedCount !== undefined
        ? `<span class="staged-count">
             📌 ${Number(repoInfo.stagedCount) || 0} staged
           </span>`
        : "";

    const selector =
      repos.length > 1
        ? `
          <select id="repo-select">
            ${repos
              .map(
                (repo, index) => `
                  <option
                    value="${index}"
                    ${index === currentRepoIndex ? "selected" : ""}
                  >
                    ${escapeHtml(repo.name || `Repository ${index + 1}`)}
                  </option>
                `,
              )
              .join("")}
          </select>
        `
        : "";

    bar.innerHTML = `
      <span class="repo-name">
        📁 ${escapeHtml(repoInfo.name || "unknown")}
      </span>

      <span class="branch-name">
        🌿 ${escapeHtml(repoInfo.branch || "detached")}
      </span>

      ${staged}
      ${selector}
    `;

    const headerBlock = document.querySelector(".header-block");

    if (headerBlock?.parentNode) {
      headerBlock.parentNode.insertBefore(bar, headerBlock);
    } else {
      app.prepend(bar);
    }

    const select = document.getElementById("repo-select");

    if (select) {
      select.addEventListener("change", (event) => {
        const index = Number.parseInt(event.target.value, 10);

        if (Number.isInteger(index) && index !== currentRepoIndex) {
          vscode.postMessage({
            type: "switchRepo",
            index,
          });
        }
      });
    }
  }

  function renderCollapsible(title, contentHtml, initiallyOpen = false) {
    return `
      <div class="collapsible-section">
        <div
          class="collapsible-header"
          data-collapsible-toggle
        >
          <span class="chevron ${initiallyOpen ? "open" : ""}">▶</span>

          ${escapeHtml(title)}
        </div>

        <div class="collapsible-body ${initiallyOpen ? "open" : ""}">
          ${contentHtml}
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    const primaryButtons = [
      {
        id: "btn-insert",
        label: t("Insert"),
        cls: "primary",
      },
      {
        id: "btn-copy",
        label: t("Copy"),
        cls: "secondary",
      },
      {
        id: "btn-reset",
        label: t("Reset"),
        cls: "secondary",
      },
      {
        id: "btn-autofill",
        label: t("⚡ Suggestions"),
        cls: "secondary",
      },
      {
        id: "btn-giteditor",
        label: t("📝 Git Editor"),
      },
    ];

    const moreButtons = [
      {
        id: "btn-ai",
        label: t("✨ AI Draft"),
      },
      {
        id: "btn-amend",
        label: t("🔄 Amend Last"),
      },
      {
        id: "btn-undo",
        label: t("↩️ Undo Insert"),
      },
      {
        id: "btn-gittemplate",
        label: t("📌 Git Template"),
      },
      {
        id: "btn-config",
        label: t("⚙ Template"),
      },
      {
        id: "btn-projectconfig",
        label: t("📁 Repo Config"),
      },
      { id: "btn-settings", label: t("⚙ Settings") },
    ];

    return `
      <div class="toolbar">
        ${primaryButtons
          .map(
            (button) => `
              <button
                class="${button.cls}"
                id="${button.id}"
              >
                ${button.label}
              </button>
            `,
          )
          .join("")}

        <div class="more-menu">
          <button
            class="secondary"
            id="more-toggle"
            type="button"
          >
            ⋮ More
          </button>

          <div
            class="dropdown-content"
            id="more-dropdown"
          >
            ${moreButtons
              .map(
                (button) => `
                  <button
                    id="${button.id}"
                    type="button"
                  >
                    ${button.label}
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  // Form / Free-form tab switcher — sits above #form so only the input
  // side changes; the live preview on the right works the same either way
  // since buildMessage() already branches on editorMode.
  function renderModeTabs() {
    return `
      <div
        class="editor-mode-tabs"
        id="editor-mode-tabs"
        role="tablist"
        aria-label="Message editor mode"
      >
        <button
          type="button"
          class="mode-tab${editorMode === "form" ? " active" : ""}"
          data-mode="form"
          role="tab"
          aria-selected="${editorMode === "form"}"
        >
          🧩 Form
        </button>

        <button
          type="button"
          class="mode-tab${editorMode === "freeform" ? " active" : ""}"
          data-mode="freeform"
          role="tab"
          aria-selected="${editorMode === "freeform"}"
        >
          📝 Free-form
        </button>
      </div>
    `;
  }

  function bindModeTabs() {
    document.querySelectorAll(".mode-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const nextMode = tab.dataset.mode;

        if (!nextMode || nextMode === editorMode) return;

        // اولین بار که کاربر به تب Free‑form می‌رود، اگر متن آزاد هنوز
        // خالی است، پیامی که تا این لحظه از فرم ساخته شده به‌عنوان نقطه‌ی
        // شروع در Textarea قرار می‌گیرد (به‌جای شروع از صفحه‌ی کاملاً
        // خالی) — این کار قبل از عوض‌شدن editorMode انجام می‌شود چون
        // buildMessage() هنوز در حالت "form" پیام را می‌سازد.
        if (nextMode === "freeform" && !freeformText.trim()) {
          const assembled = buildMessage();

          if (assembled.trim()) {
            freeformText = assembled;
          }
        }

        editorMode = nextMode;

        saveDraft();
        render();
      });
    });
  }

  function showSpinner(buttonId) {
    const button = document.getElementById(buttonId);

    if (!button) return;

    button.disabled = true;

    button.innerHTML = `
      <span class="spinner"></span>
      Loading...
    `;
  }

  function hideSpinner(buttonId, originalLabel) {
    const button = document.getElementById(buttonId);

    if (!button) return;

    button.disabled = false;
    button.textContent = originalLabel;
  }

  // Render

  function render() {
    if (!config) return;

    const message = buildMessage();
    const warnings = computeWarnings();

    const lines = message ? message.split("\n") : [];

    const gutterHtml = lines.length
      ? lines.map((_, index) => `<div>${index + 1}</div>`).join("")
      : "<div>1</div>";

    const linesHtml = lines.length
      ? lines
          .map(
            (line, index) =>
              `<div class="line${index === 0 ? " subject" : ""}">${
                escapeHtml(line) || "&nbsp;"
              }</div>`,
          )
          .join("")
      : `
          <div class="line empty-msg">
            Your commit message will appear here…
          </div>
        `;

    app.innerHTML = `
      <div class="page">
        <div class="dashboard">
          <div
            class="dashboard-row"
            id="chip-row"
          ></div>

          <div
            class="dashboard-row"
            style="margin-top:4px;"
          >
            <span
              class="progress-text"
              id="progress-text"
            ></span>
          </div>

          <div
            class="warnings"
            id="warnings-line"
            style="${warnings.length ? "" : "display:none;"}"
          >
            ⚠ <span id="warnings-count">${warnings.length}</span>
            warning<span id="warnings-plural">${warnings.length > 1 ? "s" : ""}</span> — click to jump
          </div>
        </div>

        <div class="header-block">
          <h1>
            Commit Message Editor
            <span class="template-name">
              — ${escapeHtml(activeConfigName)}
            </span>
          </h1>

          ${
            configSource
              ? `
                <span class="source-badge">
                  ${escapeHtml(configSource)}
                  ${
                    hasProjectConfig
                      ? `
                        <span class="repo">
                          repo
                        </span>
                      `
                      : ""
                  }
                </span>
              `
              : ""
          }
        </div>

        ${renderToolbar()}

        <div
          class="ai-status"
          id="ai-status"
        ></div>

        <div class="workspace">
          <div class="workspace-form">
            ${renderModeTabs()}
            <div id="form"></div>
          </div>

          <div class="workspace-preview">
            <div class="section-title">
              Message preview
            </div>

            <div class="preview-shell">
              <div class="preview-tab">
                <span class="dot"></span>
                .git / COMMIT_EDITMSG
              </div>

              <div class="preview-code">
                <div class="preview-gutter">
                  ${gutterHtml}
                </div>

                <div
                  class="preview-lines"
                  id="preview-lines"
                >
                  ${linesHtml}
                </div>
              </div>

              <div class="preview-footer">
                <span id="line-count">
                  ${lines.length || 0}
                  line${(lines.length || 0) === 1 ? "" : "s"}
                </span>

                <span id="char-count">
                  ${message.length} chars
                </span>
              </div>
            </div>

            ${
              recentCommits.length
                ? renderCollapsible(
                    `Recent commits (${recentCommits.length})`,
                    `<div id="recent-commits"></div>`,
                    false,
                  )
                : ""
            }
          </div>
        </div>
      </div>
    `;

    renderChips(warnings);
    renderForm();
    renderRepoBar();

    if (recentCommits.length) {
      renderRecentCommits();
    }

    bindModeTabs();
    bindToolbar();
    bindCollapsibles();

    if (!globalListenersBound) {
      bindGlobalListeners();
      globalListenersBound = true;
    }

    requestAnimationFrame(() => {
      config.tokens.forEach(validateField);
    });
  }

  // Dashboard

  function renderChips(warnings) {
    const row = document.getElementById("chip-row");

    const progressElement = document.getElementById("progress-text");

    if (!row || !progressElement) return;

    let filled = 0;
    let totalVisible = 0;

    if (editorMode === "freeform") {
      const hasValue = !!freeformText.trim();

      row.innerHTML = `
        <span
          class="chip ${hasValue ? "ok" : "warn"}"
          data-field="freeform-message"
        >
          Message
        </span>
      `;

      progressElement.textContent = hasValue
        ? "Free-form message"
        : "Free-form message — empty";
    } else {
      row.innerHTML = config.tokens
        .map((token) => {
          const enabled = isFieldEnabled(token);

          if (!token.required && !enabled && token.type !== "boolean") {
            return "";
          }

          totalVisible++;

          const hasValue =
            token.type === "boolean"
              ? !!values[token.name]
              : enabled && fieldValue(token.name).trim() !== "";

          let className = "empty";

          if (hasValue) {
            className = "ok";
            filled++;
          } else if (token.required) {
            className = "warn";
          }

          return `
            <span
              class="chip ${className}"
              data-field="${escapeAttr(token.name)}"
            >
              ${escapeHtml(token.label)}
            </span>
          `;
        })
        .join("");

      progressElement.textContent = `${filled} of ${
        totalVisible || config.tokens.length
      } sections`;
    }

    row.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const name = chip.dataset.field;

        const token = findToken(name);

        if (token && isCollapsible(token) && !conditionalEnabled[name]) {
          conditionalEnabled[name] = true;

          saveDraft();
          render();

          requestAnimationFrame(() => {
            document.getElementById(`f-${name}`)?.focus();
          });

          return;
        }

        document.getElementById(`f-${name}`)?.focus();
      });
    });

    const warningLine = document.getElementById("warnings-line");

    if (warningLine) {
      if (warnings.length) {
        warningLine.style.display = "";
        warningLine.title = warnings
          .map((warning) => warning.message)
          .join("\n");

        const countEl = document.getElementById("warnings-count");
        const pluralEl = document.getElementById("warnings-plural");

        if (countEl) countEl.textContent = String(warnings.length);
        if (pluralEl) pluralEl.textContent = warnings.length > 1 ? "s" : "";

        // از onclick= (به‌جای addEventListener) استفاده می‌شود چون این
        // عنصر برخلاف چیپ‌ها در هر keystroke دوباره ساخته نمی‌شود؛
        // addEventListener هر بار یک لیسنر جدید اضافه می‌کرد (نشتی حافظه
        // و فراخوانی چندباره‌ی هندلر با هر کلیک).
        warningLine.onclick = () => {
          const firstWarning = warnings[0];

          if (!firstWarning) return;

          if (editorMode === "freeform") {
            document.getElementById(`f-${firstWarning.field}`)?.focus();
            return;
          }

          const token = findToken(firstWarning.field);

          if (
            token &&
            isCollapsible(token) &&
            !conditionalEnabled[token.name]
          ) {
            conditionalEnabled[token.name] = true;

            saveDraft();
            render();

            requestAnimationFrame(() => {
              document.getElementById(`f-${token.name}`)?.focus();
            });

            return;
          }

          document.getElementById(`f-${firstWarning.field}`)?.focus();
        };
      } else {
        warningLine.style.display = "none";
        warningLine.onclick = null;
      }
    }
  }

  // Form

  // Free-form tab: one large textarea, no fields, no template — the raw
  // text becomes the commit message verbatim (see buildMessage()).
  function freeformCounterText() {
    const lines = freeformText ? freeformText.split("\n") : [];
    const lineCount = freeformText ? lines.length : 0;
    const charCount = freeformText.length;

    return `${lineCount} line${lineCount === 1 ? "" : "s"} · ${charCount} char${
      charCount === 1 ? "" : "s"
    }`;
  }

  function renderFreeformForm(formElement) {
    formElement.innerHTML = `
      <div class="field freeform-field">
        <div class="field-head">
          <label for="f-freeform-message">
            Commit message
          </label>
        </div>

        <div class="desc">
          Write the full commit message exactly as it should be committed —
          no fields, no template, just text. The first line is the subject;
          leave a blank line before the body.
        </div>

        <textarea
          id="f-freeform-message"
          class="freeform-textarea monospace"
          placeholder="feat(scope): subject&#10;&#10;Body of the commit message..."
          spellcheck="true"
        >${escapeHtml(freeformText)}</textarea>

        <div
          class="counter"
          id="freeform-counter"
        >
          ${freeformCounterText()}
        </div>
      </div>
    `;

    bindFreeformField();
  }

  function bindFreeformField() {
    const element = document.getElementById("f-freeform-message");
    if (!element) return;

    element.addEventListener("input", () => {
      freeformText = element.value;

      saveDraft();
      updatePreviewAndChips();

      const counter = document.getElementById("freeform-counter");
      if (counter) {
        counter.textContent = freeformCounterText();
      }
    });
  }

  function renderForm() {
    const formElement = document.getElementById("form");
    if (!formElement) return;

    if (editorMode === "freeform") {
      renderFreeformForm(formElement);
      return;
    }

    const hasTypeToken = config.tokens.some((t) => t.name === "type");

    const core = [];
    const pillFields = [];
    const bodyFields = [];
    const trailerFields = [];

    for (const token of config.tokens) {
      // Gitmoji no longer has its own separate box; it is displayed inside the Type grid above each column (e.g. ✨ above feat)
      if (token.name === "gitmoji" && hasTypeToken) {
        continue;
      }

      if (token.required || token.type === "boolean") {
        core.push(token);
        continue;
      }

      // Single-line text fields (Scope, Closes, Refs, Signed-off-by, etc.) are displayed in a compact 'Issue references' grid
      if (token.type === "text" && !token.multiline) {
        pillFields.push(token);
        continue;
      }

      // Body stays full width; the remaining multiline fields (BREAKING CHANGE, Co-authored-by, Reviewed-by, Tested-by, Acked-by, Reported-by) are placed side by side in a two‑column grid
      if (token.name === "body") {
        bodyFields.push(token);
      } else {
        trailerFields.push(token);
      }
    }

    let html = `<div class="core-fields">${core.map(renderField).join("")}</div>`;

    if (pillFields.length) {
      html += renderDetailGrid(pillFields);
    }

    if (bodyFields.length) {
      html += bodyFields.map(renderField).join("");
    }

    if (trailerFields.length) {
      html += `
        <div class="card-fields-grid">
          ${trailerFields.map(renderField).join("")}
        </div>
      `;
    }

    formElement.innerHTML = html;

    config.tokens.forEach(bindField);

    const autoGitmojiToggle = document.getElementById("auto-gitmoji-toggle");

    if (autoGitmojiToggle) {
      autoGitmojiToggle.addEventListener("change", () => {
        autoGitmoji = autoGitmojiToggle.checked;
        // با غیرفعال‌کردن، هر ایموجی قبلاً ثبت‌شده هم پاک می‌شود تا در
        // پیام نهایی درج نشود
        if (!autoGitmoji) {
          values.gitmoji = "";
          conditionalEnabled.gitmoji = false;
        } else {
          // با فعال‌کردن، اگر Type ی انتخاب شده باشد، ایموجی متناظرش
          //  بلافاصله اعمال شود (بدون نیاز به کلیک دوباره روی Type)
          const currentType = fieldValue("type").trim().toLowerCase();
          if (currentType) {
            const emojiMap = buildTypeEmojiMap();
            const emoji = emojiMap[currentType] || "";
            if (emoji) {
              values.gitmoji = emoji;
              conditionalEnabled.gitmoji = true;
            }
          }
        }

        saveDraft();
        render();
      });
    }

    const fetchGitIdentityBtn = document.getElementById("fetch-git-identity");

    if (fetchGitIdentityBtn) {
      fetchGitIdentityBtn.addEventListener("click", () => {
        fetchGitIdentityBtn.disabled = true;
        fetchGitIdentityBtn.textContent = "…";

        vscode.postMessage({ type: "fetchGitIdentity" });
      });
    }
  }

  // Compact detail grid — every optional single-line field (issue references, scope, signed-off-by, ...) rendered in the same pill style, with no enable/disable checkbox

  function renderDetailGrid(tokens) {
    const cells = tokens
      .map((token) => {
        const value = fieldValue(token.name);
        const active = !!value.trim();

        // Scope is displayed vertically (stacked) and spans the full grid width because it has saved chips and a save button
        const needsExtra = token.name === "scope";

        if (needsExtra) {
          return `
            <div
              class="issue-cell issue-cell--stack ${active ? "active" : ""}"
              title="${escapeAttr(token.description || "")}"
            >
              <div class="issue-cell-row">
                <span class="issue-cell-label">
                  ${escapeHtml(token.label)}
                </span>

                <input
                  type="text"
                  id="f-${escapeAttr(token.name)}"
                  class="issue-cell-input"
                  placeholder="${escapeAttr(token.description || "")}"
                  value="${escapeAttr(value)}"
                />
                ${renderScopeSaveButton(token)}
              </div>

              ${renderTokenFreqChips(token)}
            </div>
          `;
        }

        const isSignedOffBy = token.name === "signedOffBy";

        return `
          <div
            class="issue-cell ${active ? "active" : ""} ${
              isSignedOffBy ? "issue-cell--wide" : ""
            }"
            title="${escapeAttr(token.description || "")}"
          >
            <span class="issue-cell-label">
              ${escapeHtml(token.label)}
            </span>

            <input
              type="text"
              id="f-${escapeAttr(token.name)}"
              class="issue-cell-input"
              placeholder="${escapeAttr(token.description || "e.g. value")}"
              value="${escapeAttr(value)}"
            />

            ${
              isSignedOffBy
                ? `
                  <button
                    type="button"
                    class="issue-cell-git-btn"
                    id="fetch-git-identity"
                    title="دریافت نام و ایمیل از تنظیمات Git (user.name / user.email)"
                  >
                    ⇩ Git
                  </button>
                `
                : ""
            }
          </div>
        `;
      })
      .join("");

    return `
      <div class="field-block">
        <div class="issue-group-title">
          Additional details
          <span class="hint">${tokens.map((token) => escapeHtml(token.label)).join(" · ")}</span>
        </div>

        <div class="issue-grid">
          ${cells}
        </div>
      </div>
    `;
  }

  function renderField(token) {
    const requiredMark = token.required ? " *" : "";
    const labelKey = `form.${token.name}Label`;
    const label = t(labelKey) !== labelKey ? t(labelKey) : token.label;

    const description = token.description
      ? `
          <div class="desc">
            ${escapeHtml(token.description)}
          </div>
        `
      : "";

    if (token.type === "boolean") {
      return `
        <div class="field field-compact">
          <div class="checkbox-row">
            <input
              type="checkbox"
              id="f-${escapeAttr(token.name)}"
              ${values[token.name] ? "checked" : ""}
            />

            <label
              for="f-${escapeAttr(token.name)}"
            >
              ${escapeHtml(token.label)}
              ${requiredMark}
            </label>
          </div>

          ${description}
        </div>
      `;
    }

    let frequentChipsType = "";
    if (
      token.name === "type" &&
      settings.rememberFrequentTypes &&
      settings.frequentTypes?.length
    ) {
      frequentChipsType = `
      <div class="freq-chips" style="margin-top: 6px; margin-bottom: 4px;">
        <span style="font-size: 9.5px; color: var(--cme-faint); margin-right: 6px; font-weight: 500;">
          Frequent:
        </span>
        ${settings.frequentTypes
          .map(
            (type) => `
            <span class="freq-chip">
              <span class="freq-chip-label" data-set-field="${escapeAttr(token.name)}" data-set-value="${escapeAttr(type)}" data-toggle="true">
                ${escapeHtml(type)}
              </span>
            </span>
          `,
          )
          .join("")}
      </div>
    `;
    }

    // ===== چیپ‌های Frequent برای Scope (جدید) =====
    let frequentChipsScope = "";
    if (
      token.name === "scope" &&
      settings.rememberFrequentScopes &&
      settings.frequentScopes?.length
    ) {
      const existingScopes = new Set(settings.scopes || []);
      const frequentScopes = settings.frequentScopes.filter(
        (s) => !existingScopes.has(s),
      );
      if (frequentScopes.length > 0) {
        frequentChipsScope = `
        <div class="freq-chips" style="margin-top: 6px; margin-bottom: 4px;">
          <span style="font-size: 9.5px; color: var(--cme-faint); margin-right: 6px; font-weight: 500;">
            Frequent:
          </span>
          ${frequentScopes
            .slice(0, 5)
            .map(
              (scope) => `
              <span class="freq-chip">
                <span class="freq-chip-label" data-set-field="scope" data-set-value="${escapeAttr(scope)}">
                  ${escapeHtml(scope)}
                </span>
              </span>
            `,
            )
            .join("")}
        </div>
      `;
      }
    }

    // ===== دکمه‌ی Format برای Body =====
    let extraButtons = "";
    if (token.name === "body") {
      extraButtons = `
        <div class="field-actions" style="display: flex; justify-content: flex-end; margin-top: 4px;">
          <button class="issue-cell-git-btn" id="btn-format-body-${escapeAttr(token.name)}" type="button" title="${t("form.formatBodyTitle")}">
            ${t("form.formatBody")}
          </button>
        </div>
      `;
    }

    // ===== ساختار ویژه برای فیلد Body (textarea + دکمه در کنار هم) =====
    let inputControl = renderInputControl(token);
    let fieldWrapper = "";
    if (token.name === "body") {
      fieldWrapper = `
      <div style="display: flex; gap: 8px; align-items: stretch;">
        ${inputControl}
        ${extraButtons}
      </div>
    `;
    } else {
      fieldWrapper = inputControl + extraButtons;
    }

    // ===== خروجی نهایی =====
    return `
    <div class="field">
      <div class="field-head">
        <label for="f-${escapeAttr(token.name)}">
          ${escapeHtml(token.label)}
          ${requiredMark}
        </label>
        ${token.name === "type" ? renderAutoGitmojiToggle() : ""}
      </div>
      ${description}
      ${token.name === "type" ? frequentChipsType : ""}
      ${token.name === "scope" ? frequentChipsScope : ""}
      ${renderTokenFreqChips(token)}
      ${fieldWrapper}
      <div class="validation-msg"></div>
    </div>
  `;
  }

  function renderAutoGitmojiToggle() {
    return `
      <label
        class="auto-gitmoji-toggle"
        title="اگر فعال باشد، انتخاب هر Type به‌صورت خودکار ایموجی متناظرش را هم در Gitmoji قرار می‌دهد"
      >
        <input
          type="checkbox"
          id="auto-gitmoji-toggle"
          ${autoGitmoji ? "checked" : ""}
        />

        <span>Auto Gitmoji</span>
      </label>
    `;
  }

  function renderScopeSaveButton(token) {
    if (token.name !== "scope") {
      return "";
    }

    return `
      <button
        class="scope-add-btn"
        id="scope-add-${escapeAttr(token.name)}"
        type="button"
      >
        ➕ Save
      </button>
    `;
  }

  function renderTokenFreqChips(token) {
    const chips = [];

    // فقط چیپ‌های ذخیره‌شده (Saved Scopes) – با قابلیت حذف
    if (
      token.name === "scope" &&
      Array.isArray(settings.scopes) &&
      settings.scopes.length
    ) {
      for (const scope of settings.scopes) {
        chips.push(`
        <span class="freq-chip">
          <span class="freq-chip-label" data-set-field="scope" data-set-value="${escapeAttr(scope)}">
            ${escapeHtml(scope)}
          </span>
          <button type="button" class="freq-chip-remove" data-remove-scope="${escapeAttr(scope)}" title="حذف اسکوپ ذخیره‌شده «${escapeAttr(scope)}»" aria-label="حذف اسکوپ ذخیره‌شده ${escapeAttr(scope)}">
            ✕
          </button>
        </span>
      `);
      }
    }

    // ===== بخش Frequent Scope حذف شد (اکنون در renderField قرار دارد) =====

    return chips.length
      ? `<div class="freq-chips">${chips.join("")}</div>`
      : "";
  }

  function renderInputControl(token) {
    const id = `f-${token.name}`;

    if (token.type === "enum") {
      let options = Array.isArray(token.options) ? token.options : [];

      if (
        token.name === "type" &&
        Array.isArray(settings.types) &&
        settings.types.length
      ) {
        options = settings.types.map((type) => ({
          label: type,
        }));
      }

      // The Type field is special: each column shows a corresponding emoji (if found) above the type label — e.g. ✨ above feat
      if (token.name === "type") {
        return renderTypeWithEmojiGrid(token, id, options);
      }

      return renderOptionGrid(token, id, options);
    }

    if (token.multiline) {
      const rows = Math.min(Number(token.lines) || 3, 4);

      const className = token.monospace ? "monospace" : "";

      return `
        <textarea
          id="${escapeAttr(id)}"
          rows="${rows}"
          class="${className}"
        >${escapeHtml(fieldValue(token.name))}</textarea>

        ${renderCounter(token)}
      `;
    }

    return `
      <input
        type="text"
        id="${escapeAttr(id)}"
        value="${escapeAttr(fieldValue(token.name))}"
      />

      ${renderCounter(token)}
    `;
  }

  // Builds a type→emoji mapping from Gitmoji option descriptions (e.g. 'feat — a new feature'); if an emoji covers multiple types (e.g. 'build/ci/chore'), it is recorded separately for each
  function buildTypeEmojiMap() {
    const gitmojiToken = findToken("gitmoji");
    const map = {};

    if (!gitmojiToken || !Array.isArray(gitmojiToken.options)) {
      return map;
    }

    gitmojiToken.options.forEach((option) => {
      if (!option.description) return;

      const slugPart = option.description.split("—")[0] || "";

      slugPart
        .split("/")
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean)
        .forEach((slug) => {
          map[slug] = option.label;
        });
    });

    return map;
  }

  // Combined Type + Gitmoji grid: each cell shows the corresponding emoji (if any) above the type label, and a single click sets both Type and Gitmoji simultaneously
  function renderTypeWithEmojiGrid(token, id, options) {
    const current = fieldValue(token.name);
    const emojiMap = buildTypeEmojiMap();

    const cells = options
      .map((option) => {
        const label = option.label || option.value || "";
        const selected = current !== "" && current === label;
        const emoji = emojiMap[label.toLowerCase()] || "";

        const shortDesc = option.description
          ? option.description.split(" — ").pop()
          : "";

        // فقط وقتی «Auto Gitmoji» فعال است، انتخاب Type مقدار Gitmoji را
        // هم تغییر می‌دهد؛ در غیر این صورت فقط جنبه‌ی نمایشی/راهنما دارد
        const alsoSetAttr =
          emoji && autoGitmoji
            ? `data-also-set="gitmoji:${escapeAttr(emoji)}"`
            : "";

        return `
          <div
            class="option-cell type-emoji-cell ${selected ? "selected" : ""}"
            role="button"
            tabindex="0"
            data-set-field="${escapeAttr(token.name)}"
            data-set-value="${escapeAttr(label)}"
            data-toggle="true"
            ${alsoSetAttr}
            title="${escapeAttr(option.description || label)}"
          >
            <span class="option-emoji-slot ${autoGitmoji ? "" : "is-inactive"}">
              ${emoji ? escapeHtml(emoji) : ""}
            </span>

            <span class="option-icon is-word">${escapeHtml(label)}</span>

            ${
              shortDesc
                ? `<span class="option-desc">${escapeHtml(shortDesc)}</span>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    return `
      <div
        class="option-grid type-emoji-grid"
        id="${escapeAttr(id)}"
        tabindex="-1"
        aria-label="${escapeAttr(token.label)}"
      >
        ${cells}
      </div>
    `;
  }

  // Shared "option grid" used for enum fields (Gitmoji, Type, and any
  // other enum token): each option is a uniform-size box with its
  // icon/label on top and a short description underneath. Clicking a
  // selected box again clears the field (toggle), same as picking the
  // blank option in a classic <select>.
  function renderOptionGrid(token, id, options) {
    const current = fieldValue(token.name);

    const placeholder = token.required ? "— select —" : "(none)";

    const cells = options
      .map((option) => {
        const label = option.label || option.value || "";
        const selected = current !== "" && current === label;

        const shortDesc = option.description
          ? option.description.split(" — ").pop()
          : "";

        // Emoji labels (one or two pictorial characters) are displayed larger; word labels (like feat/fix/refactor) are more compact
        const isEmojiLabel = /\p{Extended_Pictographic}/u.test(label);

        return `
          <div
            class="option-cell ${selected ? "selected" : ""} ${
              isEmojiLabel ? "is-emoji" : "is-word"
            }"
            role="button"
            tabindex="0"
            data-set-field="${escapeAttr(token.name)}"
            data-set-value="${escapeAttr(label)}"
            data-toggle="true"
            title="${escapeAttr(option.description || label)}"
          >
            <span class="option-icon">${escapeHtml(label)}</span>

            ${
              shortDesc
                ? `<span class="option-desc">${escapeHtml(shortDesc)}</span>`
                : ""
            }
          </div>
        `;
      })
      .join("");

    return `
      <div
        class="option-grid"
        id="${escapeAttr(id)}"
        tabindex="-1"
        aria-label="${escapeAttr(token.label)}"
      >
        ${
          options.length
            ? cells
            : `<span class="desc">${escapeHtml(placeholder)}</span>`
        }
      </div>
    `;
  }

  function renderCounter(token) {
    const max =
      token.maxLength ||
      (token.name === "subject" ? settings.maxSubjectLength : undefined);

    if (!max) return "";

    const length = fieldValue(token.name).length;

    return `
      <div class="counter ${length > max ? "over" : ""}">
        ${length} / ${max}
      </div>
    `;
  }

  // Field Binding

  function bindField(token) {
    const element = document.getElementById(`f-${token.name}`);
    if (!element) return;

    if (token.type === "boolean") {
      element.addEventListener("change", () => {
        values[token.name] = element.checked;

        saveDraft();
        updatePreviewAndChips();
        validateField(token);
      });

      return;
    }

    const update = () => {
      setValue(token.name, element.value);

      // None of the other optional fields have a separate 'enable' checkbox: they automatically activate when typed in and deactivate when emptied
      if (isCollapsible(token)) {
        conditionalEnabled[token.name] = element.value.trim() !== "";
      }

      updatePreviewAndChips();
      validateField(token);
    };

    element.addEventListener("input", update);

    element.addEventListener("change", update);

    document
      .querySelectorAll(`[data-set-field="${escapeCssValue(token.name)}"]`)
      .forEach((chip) => {
        chip.addEventListener("click", () => {
          const isToggle = chip.getAttribute("data-toggle") === "true";
          const currentValue = fieldValue(token.name);
          const requestedValue = chip.getAttribute("data-set-value") || "";
          const nextValue =
            isToggle && currentValue === requestedValue ? "" : requestedValue;

          setValue(token.name, nextValue);

          if (isCollapsible(token)) {
            conditionalEnabled[token.name] = nextValue.trim() !== "";
          }

          // Some cells also set a secondary field at the same time (e.g. clicking 'feat' in the Type grid also changes Gitmoji to ✨)
          const alsoSet = chip.getAttribute("data-also-set");

          if (alsoSet) {
            const sepIndex = alsoSet.indexOf(":");
            const otherName = alsoSet.slice(0, sepIndex);
            const otherValue = alsoSet.slice(sepIndex + 1);
            const otherToken = findToken(otherName);

            setValue(otherName, otherValue);

            if (otherToken && isCollapsible(otherToken)) {
              conditionalEnabled[otherName] = otherValue.trim() !== "";
            }
          }

          render();
        });

        chip.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            chip.click();
          }
        });
      });

    if (token.name === "body") {
      const formatBtn = document.getElementById(
        `btn-format-body-${token.name}`,
      );
      if (formatBtn) {
        formatBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // جلوگیری از انتشار رویداد
          formatBody();
        });
      }
    }

    const addButton = document.getElementById(`scope-add-${token.name}`);

    if (addButton) {
      addButton.addEventListener("click", () => {
        const value = element.value.trim();

        if (!value) return;

        if (!Array.isArray(settings.scopes)) {
          settings.scopes = [];
        }

        if (settings.scopes.includes(value)) {
          return;
        }

        settings.scopes.push(value);

        vscode.postMessage({
          type: "addScope",
          scope: value,
        });

        render();
      });
    }

    if (token.name === "scope") {
      document
        .querySelectorAll("[data-remove-scope]")
        .forEach((removeButton) => {
          removeButton.addEventListener("click", (event) => {
            // Prevent the click from activating the chip itself (which sets the scope value)
            event.stopPropagation();

            const scopeToRemove =
              removeButton.getAttribute("data-remove-scope");

            if (!scopeToRemove) return;

            if (Array.isArray(settings.scopes)) {
              settings.scopes = settings.scopes.filter(
                (scope) => scope !== scopeToRemove,
              );
            }

            vscode.postMessage({
              type: "removeScope",
              scope: scopeToRemove,
            });

            render();
          });
        });
    }
  }

  // Preview

  function updatePreviewAndChips() {
    const message = buildMessage();

    const lines = message ? message.split("\n") : [];

    const gutter = document.querySelector(".preview-gutter");

    const body = document.getElementById("preview-lines");

    if (gutter && body) {
      gutter.innerHTML = lines.length
        ? lines.map((_, index) => `<div>${index + 1}</div>`).join("")
        : "<div>1</div>";

      body.innerHTML = lines.length
        ? lines
            .map(
              (line, index) =>
                `<div class="line${index === 0 ? " subject" : ""}">${
                  escapeHtml(line) || "&nbsp;"
                }</div>`,
            )
            .join("")
        : `
            <div class="line empty-msg">
              Your commit message will appear here…
            </div>
          `;
    }

    const lineCount = document.getElementById("line-count");

    const charCount = document.getElementById("char-count");

    if (lineCount) {
      lineCount.textContent = `${lines.length || 0} line${
        (lines.length || 0) === 1 ? "" : "s"
      }`;
    }

    if (charCount) {
      charCount.textContent = `${message.length} chars`;
    }

    renderChips(computeWarnings());
  }

  // Recent Commits

  function renderRecentCommits() {
    const container = document.getElementById("recent-commits");

    if (!container) return;

    container.innerHTML = recentCommits
      .map(
        (commit, index) => `
            <div
              class="recent-commit-item"
              data-idx="${index}"
            >
              ${escapeHtml(commit.subject || "")}
            </div>
          `,
      )
      .join("");

    container.querySelectorAll(".recent-commit-item").forEach((element) => {
      element.addEventListener("click", () => {
        const index = Number(element.getAttribute("data-idx"));

        const commit = recentCommits[index];

        if (!commit) return;

        loadRawIntoSubjectBody(
          (commit.subject || "") + (commit.body ? `\n\n${commit.body}` : ""),
        );
      });
    });
  }

  // Toolbar

  function bindToolbar() {
    bindClick("btn-insert", () => {
      vscode.postMessage({
        type: "insert",
        message: buildMessage(),
      });
    });

    bindClick("btn-copy", () => {
      vscode.postMessage({
        type: "copy",
        message: buildMessage(),
      });
    });

    bindClick("btn-reset", () => {
      if (editorMode === "freeform") {
        freeformText = "";
      } else {
        values = {};
        conditionalEnabled = {};
      }

      saveDraft();
      render();
    });

    bindClick("btn-autofill", () => {
      if (pendingActions.autoSuggest) {
        return;
      }

      pendingActions.autoSuggest = true;

      showSpinner("btn-autofill");

      vscode.postMessage({
        type: "requestAutoSuggest",
      });
    });

    bindClick("btn-giteditor", () => {
      vscode.postMessage({
        type: "openAsGitEditor",
      });
    });

    bindClick("btn-ai", () => {
      if (pendingActions.aiDraft) {
        return;
      }

      pendingActions.aiDraft = true;

      showSpinner("btn-ai");

      vscode.postMessage({
        type: "aiDraft",
      });
    });

    bindClick("btn-config", () => {
      vscode.postMessage({
        type: "openConfigEditor",
      });
    });

    bindClick("btn-gittemplate", () => {
      vscode.postMessage({
        type: "writeGitTemplate",
        message: buildMessage(),
      });
    });

    bindClick("btn-projectconfig", () => {
      vscode.postMessage({
        type: "createProjectConfig",
      });
    });

    bindClick("btn-amend", () => {
      vscode.postMessage({
        type: "amendLast",
        message: buildMessage(),
      });
    });

    bindClick("btn-settings", () => {
      vscode.postMessage({ type: "openSettings" });
    });

    bindClick("btn-undo", () => {
      vscode.postMessage({
        type: "undoLastInsert",
      });
    });
  }

  function bindClick(id, handler) {
    const element = document.getElementById(id);

    if (element) {
      element.addEventListener("click", handler);
    }
  }

  // Collapsible

  function bindCollapsibles() {
    document.querySelectorAll("[data-collapsible-toggle]").forEach((header) => {
      header.addEventListener("click", () => {
        const section = header.closest(".collapsible-section");

        if (!section) return;

        const body = section.querySelector(".collapsible-body");

        const chevron = section.querySelector(".chevron");

        body?.classList.toggle("open");

        chevron?.classList.toggle("open");
      });
    });
  }

  // Global Listeners

  function bindGlobalListeners() {
    document.addEventListener("click", (event) => {
      const toggle = document.getElementById("more-toggle");

      const dropdown = document.getElementById("more-dropdown");

      if (!toggle || !dropdown) {
        return;
      }

      if (toggle.contains(event.target)) {
        event.stopPropagation();

        dropdown.classList.toggle("open");

        return;
      }

      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove("open");
      }
    });
  }

  // Escape Helpers

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escapeCssValue(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
