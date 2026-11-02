// ui-layout-fixes.js
// چیدمان و کنترل‌های کمکی برای پنل‌های دوقلوی دیجیتال
(function () {
  "use strict";

  function addPanelControls(panel) {
    if (!panel || panel.querySelector(".twin-panel-controls")) return;

    const controls = document.createElement("div");
    controls.className = "twin-panel-controls";
    controls.innerHTML = `
      <button class="twin-mini-btn" type="button" data-twin-action="collapse" title="جمع/باز کردن پنل">−</button>
      <button class="twin-mini-btn twin-close-mini" type="button" data-twin-action="close" title="بستن پنل">×</button>
    `;

    controls.addEventListener("click", function (event) {
      const btn = event.target.closest("button[data-twin-action]");
      if (!btn) return;
      event.stopPropagation();

      if (btn.dataset.twinAction === "close") {
        panel.remove();
        syncTwinLayoutState();
        return;
      }

      if (btn.dataset.twinAction === "collapse") {
        panel.classList.toggle("is-collapsed");
        btn.textContent = panel.classList.contains("is-collapsed") ? "+" : "−";
      }
    });

    panel.prepend(controls);
  }

  function tuneScenarioPanel(panel) {
    if (!panel || panel.dataset.layoutFixed === "1") return;
    panel.dataset.layoutFixed = "1";

    const close = panel.querySelector(".twin-close-btn");
    if (close) close.setAttribute("aria-label", "بستن پنل سناریو");

    const title = panel.querySelector("h3");
    if (title && !title.querySelector(".scenario-subtitle")) {
      const small = document.createElement("small");
      small.className = "scenario-subtitle";
      small.textContent = "مقایسه اقدام فوری، اقدام برنامه‌ریزی‌شده و پایش هوشمند";
      title.appendChild(small);
    }
  }

  function syncTwinLayoutState() {
    const twinPanel = document.getElementById("twin-floating-panel");
    const scenarioPanel = document.getElementById("twin-scenario-panel");

    document.body.classList.toggle("twin-mode-active", Boolean(twinPanel));
    document.body.classList.toggle("twin-scenario-active", Boolean(scenarioPanel));

    if (twinPanel) addPanelControls(twinPanel);
    if (scenarioPanel) tuneScenarioPanel(scenarioPanel);
  }

  const observer = new MutationObserver(syncTwinLayoutState);

  window.addEventListener("DOMContentLoaded", function () {
    observer.observe(document.body, { childList: true, subtree: true });
    syncTwinLayoutState();
  });

  window.addEventListener("resize", syncTwinLayoutState);
})();

// اصلاحات تکمیلی چیدمان، گروه‌بندی دکمه‌های نقشه و نمایش تحلیل کاربری در پنل دوقلوی دیجیتال
(function () {
  "use strict";

  function toFaNumber(value) {
    return String(value ?? "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function groupMapToolbar() {
    const bar = document.querySelector(".mapbar");
    if (!bar || bar.dataset.grouped === "1") return;

    const groups = [
      { title: "پایه", ids: ["btn-home", "btn-locate", "btn-clear"] },
      { title: "لایه‌ها", ids: ["btn-landuse", "btn-bus-coverage", "btn-taxi-coverage"] },
      { title: "تحلیل", ids: ["btn-heat", "btn-problem-heat", "btn-digital-twin"] }
    ];

    const existing = new Map();
    Array.from(bar.querySelectorAll("button")).forEach((btn) => existing.set(btn.id, btn));
    bar.innerHTML = "";

    groups.forEach((group) => {
      const wrap = document.createElement("div");
      wrap.className = "mapbar-group";
      wrap.setAttribute("aria-label", group.title);
      const label = document.createElement("span");
      label.className = "mapbar-group-label";
      label.textContent = group.title;
      wrap.appendChild(label);
      group.ids.forEach((id) => {
        const btn = existing.get(id);
        if (btn) wrap.appendChild(btn);
      });
      if (wrap.querySelector("button")) bar.appendChild(wrap);
    });

    bar.dataset.grouped = "1";
  }

  function renderRows(rows, limit = 4) {
    if (!Array.isArray(rows) || !rows.length) return `<div class="twin-note">داده‌ای برای تحلیل کاربری موجود نیست.</div>`;
    return rows.slice(0, limit).map((row) => `
      <div class="twin-landuse-row">
        <div>
          <strong>${escapeHtml(row.category || row.key || row.group || "نامشخص")}</strong>
          <span>${toFaNumber(row.count || 0)} مورد | میانگین ریسک ${toFaNumber(row.avgRisk || 0)}</span>
        </div>
        <b>${toFaNumber((row.high || 0) + (row.critical || 0))}</b>
      </div>
    `).join("");
  }

  function renderMatrix(rows, limit = 5) {
    if (!Array.isArray(rows) || !rows.length) return "";
    return rows.slice(0, limit).map((row) => `
      <div class="twin-matrix-row">
        <span>${escapeHtml(row.group || "نامشخص")}</span>
        <b>${escapeHtml(row.type || "مشکل")}</b>
        <em>${toFaNumber(row.count || 0)} مورد / ریسک ${toFaNumber(row.avgRisk || 0)}</em>
      </div>
    `).join("");
  }

  function enhanceTwinPanelAnalytics() {
    const panel = document.getElementById("twin-floating-panel");
    if (!panel || panel.dataset.landuseEnhanced === "1") return;
    const summary = window.DigitalTwin?.getLastSummary?.();
    const landuse = summary?.landuseAnalytics;
    if (!landuse) return;

    const section = document.createElement("div");
    section.className = "twin-landuse-section";
    section.innerHTML = `
      <h4>تحلیل زمینه‌ای کاربری اراضی</h4>
      <div class="twin-context-grid">
        <div class="twin-context-card">
          <span>بیشترین فشار کاربری</span>
          <strong>${escapeHtml(landuse.mostReported?.category || "نامشخص")}</strong>
        </div>
        <div class="twin-context-card">
          <span>پرریسک‌ترین بافت</span>
          <strong>${escapeHtml(landuse.highestRisk?.category || "نامشخص")}</strong>
        </div>
      </div>
      <div class="twin-landuse-list">${renderRows(landuse.rows, 4)}</div>
      <h4>ماتریس مشکل × کاربری</h4>
      <div class="twin-matrix-list">${renderMatrix(landuse.matrixRows, 5)}</div>
    `;

    const management = panel.querySelector(".twin-management");
    if (management) management.insertAdjacentElement("afterend", section);
    else panel.appendChild(section);
    panel.dataset.landuseEnhanced = "1";
  }

  function enhanceScenarioPanel() {
    const panel = document.getElementById("twin-scenario-panel");
    if (!panel || panel.dataset.contextBadge === "1") return;
    const rows = Array.from(panel.querySelectorAll(".twin-scenario-row"));
    const landuseRow = rows.find((row) => row.textContent.includes("کاربری اراضی"));
    if (landuseRow) {
      const badge = document.createElement("div");
      badge.className = "twin-context-hint";
      badge.textContent = "امتیاز ریسک این سناریو با توجه به نوع مشکل، کاربری زمین، تراکم اطراف و نزدیکی به خدمات شهری محاسبه شده است.";
      landuseRow.insertAdjacentElement("afterend", badge);
    }
    panel.dataset.contextBadge = "1";
  }

  const observer = new MutationObserver(() => {
    groupMapToolbar();
    enhanceTwinPanelAnalytics();
    enhanceScenarioPanel();
  });

  window.addEventListener("DOMContentLoaded", () => {
    groupMapToolbar();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
