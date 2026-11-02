/**
 * Browser-side chart rendering and Excel export controls.
 * Data is retrieved from the Django dataset API.
 */
(() => {
  "use strict";

  const urls = window.QAZVIN_DATA_URLS || {};
  const excelUrl = window.QAZVIN_EXCEL_URL || "/api/export/excel/";
  const datasetLabels = {
    roads: "شبکه معابر",
    bus: "ایستگاه‌های اتوبوس",
    taxi: "ایستگاه‌های تاکسی",
    fuel: "جایگاه‌های سوخت",
    hospitals: "مراکز درمانی",
    problems: "گزارش‌های مشکلات شهری",
    landuse: "کاربری اراضی",
    odPriority: "شاخص اولویت محلات",
    neighborhoods: "محدوده محلات"
  };
  const countTargets = {
    roads: "stat-roads",
    bus: "stat-bus",
    taxi: "stat-taxi",
    fuel: "stat-fuel",
    hospitals: "stat-hospitals",
    problems: "stat-problems",
    odPriority: "stat-od-priority",
    landuse: "stat-landuse",
    neighborhoods: "stat-neighborhoods"
  };
  let lastSvg = "";
  let chartBusy = false;

  const faNumber = (value) => Number(value || 0).toLocaleString("fa-IR");
  const asFeatures = (data) => Array.isArray(data?.features) ? data.features : [];
  const clean = (value) => String(value ?? "").trim();
  const xmlEscape = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

  async function fetchDataset(key) {
    const url = urls[key];
    if (!url) throw new Error("مسیر داده «" + (datasetLabels[key] || key) + "» تعریف نشده است.");
    const response = await fetch(url, { headers: { Accept: "application/geo+json, application/json" } });
    if (!response.ok) throw new Error("بارگذاری «" + (datasetLabels[key] || key) + "» با خطا روبه‌رو شد (" + response.status + ").");
    const data = await response.json();
    if (!data || typeof data !== "object") throw new Error("ساختار داده دریافتی معتبر نیست.");
    return data;
  }

  function setChartStatus(message, state = "") {
    const node = document.getElementById("chart-status");
    if (!node) return;
    node.textContent = message;
    if (state) node.dataset.state = state;
    else delete node.dataset.state;
  }

  function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function getProblemCategory(props = {}) {
    return clean(props.category || props.Category || props.cat || props.problem_category || props["دسته‌بندی"] || props["دسته بندی"] || "سایر / نامشخص");
  }

  async function buildRows(chartType) {
    if (chartType === "problem-categories") {
      const data = await fetchDataset("problems");
      const counts = new Map();
      asFeatures(data).forEach((feature) => {
        const label = getProblemCategory(feature.properties || {});
        counts.set(label, (counts.get(label) || 0) + 1);
      });
      return {
        title: "تعداد گزارش‌های مشکلات شهری به تفکیک دسته",
        rows: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
        metric: "تعداد گزارش"
      };
    }

    if (chartType === "od-pressure" || chartType === "od-access-time") {
      const data = await fetchDataset("odPriority");
      const isPressure = chartType === "od-pressure";
      const property = isPressure ? "od_pressure_norm" : "access_time_min";
      const rows = asFeatures(data).map((feature, index) => {
        const props = feature.properties || {};
        const value = safeNumber(props[property]);
        if (value === null) return null;
        return {
          label: clean(props.name || props["نام"] || props.neighborhood || ("محله " + (index + 1))),
          value
        };
      }).filter(Boolean).sort((a, b) => isPressure ? b.value - a.value : b.value - a.value);
      return {
        title: isPressure ? "شاخص نرمال‌شده فشار OD محلات" : "زمان دسترسی ثبت‌شده محلات",
        rows,
        metric: isPressure ? "شاخص نرمال‌شده" : "دقیقه"
      };
    }

    const keys = Object.keys(datasetLabels);
    const results = await Promise.all(keys.map(async (key) => {
      try {
        const data = await fetchDataset(key);
        return { label: datasetLabels[key], value: asFeatures(data).length };
      } catch (error) {
        return { label: datasetLabels[key], value: null, error: error.message };
      }
    }));
    return {
      title: "تعداد عوارض در لایه‌های داده",
      rows: results.filter((row) => row.value !== null).sort((a, b) => b.value - a.value),
      metric: "تعداد رکورد"
    };
  }

  function createHorizontalBarSvg(rows, title, metric) {
    const width = 900;
    const rowHeight = rows.length > 12 ? 29 : 34;
    const height = Math.max(160, 74 + rows.length * rowHeight);
    const labelX = width - 12;
    const barX = 450;
    const maxBar = 330;
    const valueX = barX - 12;
    const max = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
    const palette = ["#1769e0", "#239b87", "#d97706", "#7c65d6", "#e05252", "#3888c7"];
    const lines = [];
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xmlEscape(title)}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMin meet">`);
    lines.push(`<rect width="${width}" height="${height}" rx="10" fill="#ffffff"/>`);
    lines.push(`<text x="${labelX}" y="25" text-anchor="end" fill="#53677e" font-size="13">${xmlEscape(metric)}</text>`);
    lines.push(`<line x1="${barX}" y1="40" x2="${barX}" y2="${height - 14}" stroke="#e2e8f0" stroke-width="1"/>`);
    rows.forEach((row, index) => {
      const y = 48 + index * rowHeight;
      const value = Number(row.value) || 0;
      const barWidth = Math.max(value > 0 ? 2 : 0, (value / max) * maxBar);
      const color = palette[index % palette.length];
      if (index % 2 === 0) lines.push(`<rect x="4" y="${y - 7}" width="${width - 8}" height="${rowHeight}" rx="6" fill="#f8fafc"/>`);
      lines.push(`<text x="${labelX}" y="${y + 10}" text-anchor="end" fill="#243b53" font-size="12">${xmlEscape(row.label)}</text>`);
      lines.push(`<rect x="${barX}" y="${y}" width="${barWidth}" height="14" rx="5" fill="${color}" opacity="0.88"/>`);
      lines.push(`<text x="${valueX}" y="${y + 11}" text-anchor="end" fill="#445b73" font-size="11">${xmlEscape(Number(value.toFixed(3)).toLocaleString("en-US"))}</text>`);
    });
    lines.push("</svg>");
    return lines.join("");
  }

  async function createChart() {
    if (chartBusy) return;
    const select = document.getElementById("chart-type");
    const button = document.getElementById("btn-build-chart");
    const container = document.getElementById("analysis-chart-container");
    const chartTarget = document.getElementById("analysis-chart");
    const titleTarget = document.getElementById("analysis-chart-title");
    const countTarget = document.getElementById("analysis-chart-count");
    const downloadButton = document.getElementById("btn-download-chart");
    if (!select || !chartTarget || !container) return;

    chartBusy = true;
    if (button) { button.disabled = true; button.textContent = "در حال ساخت…"; }
    setChartStatus("در حال دریافت داده و محاسبه مقادیر نمودار…");
    try {
      const result = await buildRows(select.value);
      if (!result.rows.length) throw new Error("برای این نمودار داده قابل نمایش پیدا نشد.");
      const svg = createHorizontalBarSvg(result.rows, result.title, result.metric);
      chartTarget.innerHTML = svg;
      lastSvg = svg;
      if (titleTarget) titleTarget.textContent = result.title;
      if (countTarget) countTarget.textContent = faNumber(result.rows.length) + " مورد";
      container.hidden = false;
      if (downloadButton) downloadButton.disabled = false;
      setChartStatus("نمودار از داده‌های واقعی موجود ساخته شد.", "success");
    } catch (error) {
      console.error("Chart generation failed:", error);
      setChartStatus(error.message || "ساخت نمودار انجام نشد.", "error");
    } finally {
      chartBusy = false;
      if (button) { button.disabled = false; button.textContent = "ساخت نمودار"; }
    }
  }

  function downloadChart() {
    if (!lastSvg) return;
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${lastSvg}`], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "qazvin-urban-decision-chart.svg";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportExcel() {
    const select = document.getElementById("excel-dataset");
    const button = document.getElementById("btn-export-excel");
    if (!select) return;
    const dataset = select.value || "all";
    if (button) {
      button.disabled = true;
      button.textContent = "آماده‌سازی فایل…";
    }
    setChartStatus("درخواست ایجاد فایل Excel ارسال شد؛ دانلود پس از آماده‌سازی آغاز می‌شود.");
    const target = new URL(excelUrl, window.location.href);
    target.searchParams.set("dataset", dataset);
    window.location.assign(target.toString());
    window.setTimeout(() => {
      if (button) {
        button.disabled = false;
        button.innerHTML = "<span>⇩</span> دریافت فایل Excel (.xlsx)";
      }
    }, 1800);
  }


  function bindHeaderSearch() {
    const header = document.getElementById("header-neighborhood-search");
    const search = document.getElementById("neighborhood-search-input");
    const submit = document.getElementById("neighborhood-search-btn");
    if (!header || !search || !submit) return;
    const runSearch = () => {
      search.value = header.value;
      submit.click();
    };
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); runSearch(); }
    });
    header.addEventListener("change", runSearch);
    search.addEventListener("input", () => { header.value = search.value; });
}

  function mirrorSystemStatus() {
    const source = document.getElementById("sys-msg");
    const target = document.getElementById("header-status");
    if (!source || !target || !window.MutationObserver) return;
    const sync = () => {
      const value = clean(source.textContent);
      if (value) target.textContent = value;
    };
    sync();
    new MutationObserver(sync).observe(source, { childList: true, subtree: true, characterData: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-build-chart")?.addEventListener("click", createChart);
    document.getElementById("btn-download-chart")?.addEventListener("click", downloadChart);
    document.getElementById("btn-export-excel")?.addEventListener("click", exportExcel);
    bindHeaderSearch();
    mirrorSystemStatus();
  });
})();
