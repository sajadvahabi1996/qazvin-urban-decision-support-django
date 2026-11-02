/* Dashboard state, data visualization, and user interactions. */

  // ============================================================================
  // تعریف توابع پایه‌ای و مفقودشده (فیلتر داده‌ها و ساخت پاپ‌آپ‌ها)
  // ============================================================================
  window.filteredProblems = function filteredProblems() {
    if (!problemsData || !Array.isArray(problemsData.features)) {
      return { type: "FeatureCollection", features: [] };
    }
    
    let features = problemsData.features;
    
    // فیلتر دسته‌بندی موضوعی (در صورت انتخاب از پنل دسته‌ها)
    if (typeof activeProblemCategory !== "undefined" && activeProblemCategory) {
      features = features.filter((f) => {
        const cat = getCategory(f.properties || {});
        return cat === activeProblemCategory;
      });
    }
    
    // فیلتر هوشمند سناریو اقدام
    if (window.activeTwinFilter && window.activeTwinFilter !== "all") {
      features = features.filter((f) => {
        const p = f.properties || {};
        const risk = Number(p.twin_risk_score || 0);
        const group = String(p.twin_landuse_group || p.twin_landuse || "");
        
        if (window.activeTwinFilter === "critical") return risk >= 80;
        if (window.activeTwinFilter === "sensitive_landuse") return group.includes("درمانی") || group.includes("آموزشی") || group.includes("مسکونی");
        if (window.activeTwinFilter === "high_od_pressure") return Number(p.twin_od_pressure_norm || 0) >= 60;
        return true;
      });
    }
    
    return {
      ...problemsData,
      features: features
    };
  };

  window.makeProblemPopup = function makeProblemPopup(props = {}) {
    const title = escapeHtml(props.title || props.name || props.message || "گزارش مشکل شهری");
    const cat = escapeHtml(getCategory(props));
    const address = escapeHtml(props.address || props["آدرس"] || "ثبت نشده");
    const color = getCategoryColor(cat);
    
    return '<div class="twin-popup" style="direction:rtl; text-align:right; font-family:Tahoma,sans-serif;">' +
      '<h3 style="color:' + color + '; margin:0 0 8px; border-bottom:1px solid #334155; padding-bottom:6px; font-size:14px;">' + title + '</h3>' +
      '<div class="twin-popup-row"><span>دسته:</span><strong style="color:' + color + ';">' + cat + '</strong></div>' +
      '<div class="twin-popup-row"><span>آدرس:</span><strong>' + address + '</strong></div>' +
      '</div>';
  };

  window.makeTwinPopup = function makeTwinPopup(feature = {}) {
    const p = feature.properties || {};
    const id = escapeJsSingle(p.twin_id || "");
    const title = escapeHtml(p.twin_type || p.twin_title || "گزارش شهری");
    const score = toFaNumber(p.twin_risk_score || 0);
    const level = escapeHtml(p.twin_risk_level || "نامشخص");
    const color = p.twin_risk_color || "#38bdf8";
    const windowTime = escapeHtml(p.twin_action_window || "پایش");
    const odName = escapeHtml(p.twin_od_neighborhood || "عمومی");
    
    return '<div class="twin-popup" style="direction:rtl; text-align:right; font-family:Tahoma,sans-serif; min-width:220px;">' +
      '<h3 style="color:' + color + '; margin:0 0 8px; border-bottom:1px solid #334155; padding-bottom:6px; font-size:14px;">🎯 ' + title + '</h3>' +
      '<div class="twin-popup-row"><span>اولویت مداخله:</span><strong style="color:' + color + ';">' + level + ' (' + score + '/۱۰۰)</strong></div>' +
      '<div class="twin-popup-row"><span>زمان اقدام:</span><strong>' + windowTime + '</strong></div>' +
      '<div class="twin-popup-row"><span>محله متصل (OD):</span><strong>' + odName + '</strong></div>' +
      '<button type="button" class="twin-popup-btn" onclick="window.runTwinScenario(\'' + id + '\', true)">مشاهده جزئیات سناریو 🛠️</button>' +
      '</div>';
  };

  // ============================================================================
  // توابع مدیریت پنل‌ها و سناریوها
  // ============================================================================
  function removeTwinPanel() {
    if (twinPanelEl) {
      twinPanelEl.remove();
      twinPanelEl = null;
    }
  }

  function removeTwinScenarioPanel() {
    document.getElementById("twin-scenario-panel")?.remove();
  }

  function zoomToProblem(feature, zoom = 17) {
    const coords = feature?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;
    map.setView([coords[1], coords[0]], zoom);
  }

  function renderTwinFeatureItem(feature, index, type = "priority") {
    const p = feature.properties || {};
    const id = escapeJsSingle(p.twin_id || "");
    const title = escapeHtml(p.twin_type || p.twin_title || "گزارش شهری");
    const score = toFaNumber(p.twin_risk_score || 0);
    const nearby = toFaNumber(p.twin_nearby_count || 0);
    const action = escapeHtml(p.twin_action_window || "پایش");
    const trend = escapeHtml(p.twin_prediction_72h?.level || p.twin_trend || "نامشخص");
    const hotspotScore = p.twin_hotspot_score ? " | امتیاز کانون: " + toFaNumber(p.twin_hotspot_score) : "";
    const anomalyReason = p.twin_anomaly_reason ? " | علت: " + escapeHtml(p.twin_anomaly_reason) : "";
    const label =
      type === "hotspot"
        ? "کانون " + toFaNumber(index + 1)
        : type === "anomaly"
          ? "ناهنجاری " + toFaNumber(index + 1)
          : "اولویت " + toFaNumber(index + 1);

    return '<div class="twin-list-item" onclick="window.runTwinScenario(\'' + id + '\', true)"><div class="twin-list-title"><span>' + label + ': ' + title + '</span><span class="twin-badge">اولویت ' + score + '</span></div><div class="twin-list-meta">گزارش‌های اطراف: ' + nearby + ' | روند: ' + trend + ' | زمان اقدام: ' + action + hotspotScore + anomalyReason + '</div></div>';
  }

  function showTwinPanel() {
    removeTwinPanel();

    if (!window.DigitalTwin?.buildTwinSummary || !problemsData) {
      toastShow("داده سناریو اقدام آماده نیست", "err");
      return;
    }

    const data = window.filteredProblems();
    const summary = window.DigitalTwin.buildTwinSummary(data);
    const analytics = summary.categoryAnalytics || {};

    twinPanelEl = document.createElement("div");
    twinPanelEl.id = "twin-floating-panel";

    const hotspotsHtml = summary.hotspots.length
      ? summary.hotspots.map((feature, index) => renderTwinFeatureItem(feature, index, "hotspot")).join("")
      : '<div class="twin-note">کانون بحرانی مشخصی در فیلتر فعلی پیدا نشد.</div>';

    const prioritiesHtml = summary.priorities.length
      ? summary.priorities.slice(0, 7).map((feature, index) => renderTwinFeatureItem(feature, index, "priority")).join("")
      : '<div class="twin-note">موردی برای اولویت عملیات پیدا نشد.</div>';

    const anomaliesHtml = summary.anomalies?.length
      ? summary.anomalies.map((feature, index) => renderTwinFeatureItem(feature, index, "anomaly")).join("")
      : '<div class="twin-note">الگوی غیرعادی مهمی در فیلتر فعلی تشخیص داده نشد.</div>';

    const simulation = summary.simulation || {};
    const simulationHtml = simulation.title
      ? '<div class="twin-note"><b>' + escapeHtml(simulation.title) + '</b><br>' + escapeHtml(simulation.immediate || "") + '<br>' + escapeHtml(simulation.normal || "") + '<br>' + escapeHtml(simulation.monitor || "") + '<br><b>' + escapeHtml(simulation.recommendation || "") + '</b></div>'
      : '<div class="twin-note">برای شبیه‌سازی اقدام داده کافی موجود نیست.</div>';

    twinPanelEl.innerHTML = '<h3>🎯 سناریو اقدام و پایش هوشمند</h3><div class="twin-grid"><div class="twin-card twin-wide"><span>شاخص فشار خدمات شهری</span><strong>' + toFaNumber(summary.urbanPressureIndex) + '/۱۰۰</strong><div class="twin-note">وضعیت: ' + escapeHtml(summary.pressureStatus) + '</div></div><div class="twin-card"><span>میانگین اولویت</span><strong>' + toFaNumber(summary.avgRisk) + '</strong></div><div class="twin-card"><span>کل گزارش‌ها</span><strong>' + toFaNumber(summary.total) + '</strong></div><div class="twin-card"><span>فوری/بحرانی</span><strong>' + toFaNumber(summary.critical) + '</strong></div><div class="twin-card"><span>اولویت بالا</span><strong>' + toFaNumber(summary.high) + '</strong></div></div><h4>خلاصه مدیریتی</h4><div class="twin-management">' + escapeHtml(summary.managementSummary) + '</div><h4>کانون‌های تمرکز اقدام</h4><div class="twin-list">' + hotspotsHtml + '</div><h4>نقاط نیازمند بررسی سریع</h4><div class="twin-list">' + anomaliesHtml + '</div><h4>اولویت عملیات مداخله</h4><div class="twin-list">' + prioritiesHtml + '</div><h4>شبیه‌سازی اثر اقدام</h4>' + simulationHtml + '<h4>تحلیل دسته‌ها</h4><div class="twin-note">بیشترین گزارش: ' + escapeHtml(analytics.mostReported?.category || "نامشخص") + '<br>حساس‌ترین دسته: ' + escapeHtml(analytics.highestRisk?.category || "نامشخص") + '<br>پرتراکم‌ترین دسته: ' + escapeHtml(analytics.mostDense?.category || "نامشخص") + '</div>';

    document.body.appendChild(twinPanelEl);
  }

  window.runTwinScenario = function runTwinScenario(problemId, doZoom = true) {
    const feature = problemsData?.features?.find((item) => String(item.properties?.twin_id) === String(problemId));

    if (!feature) {
      toastShow("گزارش انتخاب‌شده پیدا نشد", "err");
      return;
    }

    const p = feature.properties || {};
    const steps = Array.isArray(p.twin_scenario_steps) ? p.twin_scenario_steps : [];
    const reasons = Array.isArray(p.twin_reasons) ? p.twin_reasons : [];
    const scenarios = Array.isArray(p.twin_action_scenarios) ? p.twin_action_scenarios : [];

    const scenariosHtml = scenarios.length
      ? scenarios.map((scenario) => '<div class="twin-scenario-card"><h5>' + escapeHtml(scenario.title || "سناریو") + '</h5><p>' + escapeHtml(scenario.description || "") + '</p><div class="twin-scenario-metrics"><span>اولویت: <b>' + escapeHtml(scenario.priority || "نامشخص") + '</b></span><span>زمان: <b>' + escapeHtml(scenario.timeWindow || "نامشخص") + '</b></span><span>هزینه: <b>' + escapeHtml(scenario.cost || "نامشخص") + '</b></span><span>کاهش فشار: <b>' + toFaNumber(scenario.estimatedImpact || 0) + '٪</b></span></div></div>').join("")
      : '<div class="twin-management">سناریوی چندگزینه‌ای برای این گزارش موجود نیست.</div>';

    removeTwinScenarioPanel();

    const panel = document.createElement("div");
    panel.id = "twin-scenario-panel";
    panel.innerHTML = '<button class="twin-close-btn" type="button" onclick="document.getElementById(\'twin-scenario-panel\')?.remove()">×</button><h3>🛠️ جزئیات سناریو اقدام</h3><div class="twin-scenario-row"><span>مشکل</span><strong>' + escapeHtml(p.twin_type || p.twin_title || "گزارش شهری") + '</strong></div><div class="twin-scenario-row"><span>سطح اولویت</span><strong>' + escapeHtml(p.twin_risk_level || "نامشخص") + ' - ' + toFaNumber(p.twin_risk_score || 0) + '/۱۰۰</strong></div><div class="twin-scenario-row"><span>زمان اقدام</span><strong>' + escapeHtml(p.twin_action_window || "پایش") + '</strong></div><div class="twin-scenario-row"><span>کیفیت داده</span><strong>' + escapeHtml(p.twin_data_quality || "نامشخص") + '</strong></div>' + (p.twin_landuse ? '<div class="twin-scenario-row"><span>کاربری اراضی</span><strong>' + escapeHtml(p.twin_landuse) + '</strong></div>' : "") + (p.twin_nearest_hospital_name ? '<div class="twin-scenario-row"><span>نزدیک‌ترین مرکز درمانی</span><strong>' + escapeHtml(p.twin_nearest_hospital_name) + ' - ' + toFaNumber(p.twin_nearest_hospital_distance_m || 0) + ' متر</strong></div>' : "") + '<div class="twin-scenario-row"><span>روند پیش‌بینی</span><strong>' + escapeHtml(p.twin_trend || "نامشخص") + '</strong></div><div class="twin-scenario-row"><span>پیش‌بینی ۷۲ ساعته</span><strong>' + escapeHtml(p.twin_prediction_72h?.text || "نامشخص") + '</strong></div><div class="twin-scenario-row"><span>احتمال تشدید</span><strong>' + toFaNumber(p.twin_escalation_probability || p.twin_prediction_score || 0) + '٪</strong></div><h4>سناریوهای قابل انتخاب</h4>' + scenariosHtml + '<h4>دلایل اولویت‌دهی</h4><ul class="twin-scenario-list">' + reasons.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul><h4>اقدام عملیاتی پیشنهادی</h4><div class="twin-management">' + escapeHtml(p.twin_recommendation || "ثبت در صف بررسی و پایش دوره‌ای") + '</div><h4>مراحل اجرایی</h4><ul class="twin-scenario-list">' + steps.map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ul><h4>اثر مورد انتظار رسیدگی</h4><div class="twin-management">' + escapeHtml(p.twin_expected_impact || "کاهش فشار محدوده و بهبود وضعیت پایش") + '</div>';

    document.body.appendChild(panel);

    if (doZoom) zoomToProblem(feature, 17);
  };

  async function loadHospitals() {
    const result = await loadGeoJsonLayer({
      name: "🏥 مراکز درمانی",
      url: DATAURLS.hospitals,
      statElId: "stat-hospitals",
      pointToLayer: (feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 0.95
        }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        const name = pick(p, ["name", "نام", "title", "عنوان"]);
        layer.bindPopup('<div class="popup-title">مرکز درمانی</div><div class="popup-row"><b>نام:</b> ' + escapeHtml(name || "بدون نام") + '</div>');
      }
    });

    hospitalData = result?.data || null;
    hospitalLayer = result?.layer || null;
    return hospitalData;
  }

  function createLanduseGeoLayer(data) {
    return L.geoJSON(data, {
      pane: "landusePane",
      renderer: L.canvas({ pane: "landusePane", padding: 0.35 }),
      filter: (feature) => {
        const p = feature.properties || {};
        const lu = normalizeFaText(p.LU || p.lu || p.landuse || p["کاربری"] || p["نوع_کاربری"] || "");
        const group = normalizeFaText(p.landuse_group || p.group || "");
        
        if (
          lu.includes("نظامی") || group.includes("نظامی") ||
          lu.includes("انتظامی") || group.includes("انتظامی") ||
          lu.includes("اداری") || group.includes("اداری")
        ) {
          return false;
        }
        return true;
      },
      style: getLanduseStyle,
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        let lu = normalizeFaText(p.LU || p.lu || p.landuse || p["کاربری"] || p["نوع_کاربری"] || "نامشخص");
        let group = normalizeFaText(p.landuse_group || getLanduseGroup(lu));
        
        if (lu.includes("نظامی") || lu.includes("انتظامی") || lu.includes("اداری")) {
          lu = "خدمات عمومی و شهری";
        }
        if (group.includes("نظامی") || group.includes("انتظامی") || group.includes("اداری")) {
          group = "خدمات عمومی و شهری";
        }

        const code = p.LU_Code || p.lu_code || p.code || p["کد"] || "";
        const zone = p["منطقه"] || p.zone || "";

        layer.bindPopup(
          '<div class="popup-title landuse-title">کاربری اراضی</div>' +
          '<div class="popup-row"><b>کاربری:</b> ' + escapeHtml(lu) + '</div>' +
          '<div class="popup-row"><b>گروه:</b> ' + escapeHtml(group) + '</div>' +
          (code ? '<div class="popup-row"><b>کد:</b> ' + escapeHtml(code) + '</div>' : "") +
          (zone ? '<div class="popup-row"><b>منطقه:</b> ' + escapeHtml(zone) + '</div>' : "")
        );
      }
    });
  }

  function registerLanduseLayer() {
    if (landuseLayer) return;
    landuseLayer = L.layerGroup();
    layersControl.addOverlay(landuseLayer, "🧩 کاربری اراضی");
  }

  async function loadLanduseOnDemand() {
    if (landuseLoaded || landuseLoading || !landuseLayer) return;

    landuseLoading = true;
    toastShow("در حال بارگذاری کاربری اراضی…", "ok");

    try {
      const data = await fetchJson(DATAURLS.landuse);
      landuseGeoLayer = createLanduseGeoLayer(data);
      landuseLayer.addLayer(landuseGeoLayer);
      landuseLoaded = true;
      toastShow("کاربری اراضی بارگذاری شد: " + toFaNumber(featureCount(data)) + " پلیگون", "ok");
    } catch (error) {
      console.error("landuse error:", error);
      toastShow("خطا در بارگذاری کاربری اراضی؛ نام فایل landuse_web.geojson را بررسی کنید", "err");
      if (map.hasLayer(landuseLayer)) map.removeLayer(landuseLayer);
    } finally {
      landuseLoading = false;
    }
  }

  async function loadProblems() {
    try {
      const rawProblems = await fetchJson(DATAURLS.problems);

      const [landuseContext, busContext, taxiContext, fuelContext] = await Promise.all([
        fetchJson(DATAURLS.landuse).catch(() => null),
        fetchJson(DATAURLS.bus).catch(() => null),
        fetchJson(DATAURLS.taxi).catch(() => null),
        fetchJson(DATAURLS.fuel).catch(() => null)
      ]);

      if (window.DigitalTwin?.setContext) {
        window.DigitalTwin.setContext({
          hospitals: hospitalData,
          landuse: landuseContext,
          bus: busContext,
          taxi: taxiContext,
          fuel: fuelContext
        });
      }

      problemsData = window.DigitalTwin?.enrichProblemsWithTwinData
        ? window.DigitalTwin.enrichProblemsWithTwinData(rawProblems, {
            hospitals: hospitalData,
            landuse: landuseContext,
            bus: busContext,
            taxi: taxiContext,
            fuel: fuelContext
          })
        : rawProblems;

      if (typeof renderProblems === "function") renderProblems();
      if (typeof buildCategoryPanel === "function") buildCategoryPanel();

      const pStat = document.getElementById("stat-problems");
      const cStat = document.getElementById("stat-categories");

      if (pStat) pStat.textContent = toFaNumber(featureCount(problemsData));
      if (cStat && typeof getCategoryCounts === "function") cStat.textContent = toFaNumber(Object.keys(getCategoryCounts()).length);

      return true;
    } catch (error) {
      console.error("problems error:", error);

      const pStat = document.getElementById("stat-problems");
      const cStat = document.getElementById("stat-categories");
      const catEl = document.getElementById("category-list");

      if (pStat) pStat.textContent = "۰";
      if (cStat) cStat.textContent = "۰";

      if (catEl) {
        catEl.innerHTML = "<p>فایل مشکلات پیدا نشد. فایل را با نام <b>data/problems.geojson</b> قرار بده.</p>";
      }

      toastShow("فایل مشکلات شهری پیدا نشد", "err");
      return false;
    }
  }

  function hideProblemLayerTemporarily() {
    if (problemsLayer && map.hasLayer(problemsLayer)) {
      map.removeLayer(problemsLayer);
    }
  }

  function showProblemLayerIfNeeded() {
    if (problemsLayer && !map.hasLayer(problemsLayer)) {
      problemsLayer.addTo(map);
    }
  }

  function setTwinButtonState() {
    const btn = document.getElementById("btn-digital-twin");
    if (btn) btn.classList.toggle("active", twinMode);
  }

  function buildTwinStatusText() {
    if (!window.DigitalTwin?.buildTwinSummary || !problemsData) return "";
    const summary = window.DigitalTwin.buildTwinSummary(window.filteredProblems());
    return "سناریو اقدام فعال است | شاخص فشار: " + toFaNumber(summary.urbanPressureIndex) + "/۱۰۰ | وضعیت: " + summary.pressureStatus;
  }

  async function init() {
    if (typeof injectTwinStyles === "function") injectTwinStyles();
    loader(true);
    setSys("در حال بارگذاری داده‌ها…");

    busCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
    taxiCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
    fuelCluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });

    const roadsRes = await loadGeoJsonLayer({
      name: "راه",
      url: DATAURLS.roads,
      fit: true,
      statElId: "stat-roads",
      style: { color: "#f97316", weight: 2 }
    });

    roadsLayer = roadsRes?.layer || null;
    roadsLayer?.eachLayer((l) => enableSelectable(l, { weight: 5, opacity: 1 }));

    const busRes = await loadGeoJsonLayer({
      name: "ایستگاه اتوبوس",
      url: DATAURLS.bus,
      statElId: "stat-bus",
      cluster: busCluster,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, makePointStyle("#38bdf8", "#0ea5e9")),
      onEachFeature: (f, layer) => {
        const ll = layer.getLatLng?.();
        if (ll) {
          busStopsIndex.push({ layer, latlng: ll });
        }
        layer.on("click", (e) => {
          const { lat, lng } = e.latlng;
          layer.bindPopup("<b>ایستگاه اتوبوس</b><br><b>مختصات:</b> " + lat.toFixed(6) + ", " + lng.toFixed(6)).openPopup();
        });
      }
    });

    busLayer = busRes?.layer || null;
    busLayer?.eachLayer((l) => enableSelectable(l, { radius: 9, weight: 2 }));

    const taxiRes = await loadGeoJsonLayer({
      name: "ایستگاه تاکسی",
      url: DATAURLS.taxi,
      statElId: "stat-taxi",
      cluster: taxiCluster,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, makePointStyle("#facc15", "#eab308")),
      onEachFeature: (f, layer) => {
        layer.on("click", (e) => {
          const { lat, lng } = e.latlng;
          layer.bindPopup("<b>ایستگاه تاکسی</b><br><b>مختصات:</b> " + lat.toFixed(6) + ", " + lng.toFixed(6)).openPopup();
        });
      }
    });

    taxiLayer = taxiRes?.layer || null;
    taxiLayer?.eachLayer((l) => enableSelectable(l, { radius: 9, weight: 2 }));

    const fuelRes = await loadGeoJsonLayer({
      name: "جایگاه سوخت",
      url: DATAURLS.fuel,
      statElId: "stat-fuel",
      cluster: fuelCluster,
      pointToLayer: (f, latlng) => L.circleMarker(latlng, makePointStyle("#22c55e", "#16a34a")),
      onEachFeature: (f, layer) => {
        layer.on("click", (e) => {
          const { lat, lng } = e.latlng;
          layer.bindPopup("<b>جایگاه سوخت</b><br><b>مختصات:</b> " + lat.toFixed(6) + ", " + lng.toFixed(6)).openPopup();
        });
      }
    });

    fuelLayer = fuelRes?.layer || null;
    fuelLayer?.eachLayer((l) => enableSelectable(l, { radius: 9, weight: 2 }));

    await loadHospitals();
    registerLanduseLayer();

    await loadGeoJsonLayer({
      name: "اولویت مداخله محلات (OD)",
      url: DATAURLS.odPriority,
      style: getODPressureStyle,
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        layer.bindPopup('<div class="popup-title"><strong>' + escapeHtml(p.name || "محله") + '</strong></div><div class="popup-row"><b>شاخص OD:</b> ' + toFaNumber(Number(p.od_pressure_norm || 0).toFixed(1)) + '</div><div class="popup-row"><b>درخواست‌ها:</b> ' + toFaNumber(p.flow_count || 0) + '</div><div class="popup-row"><b>زمان دسترسی:</b> ' + toFaNumber(Number(p.access_time_min || 0).toFixed(1)) + ' دقیقه</div>');
        enableSelectable(layer, { weight: 2.5, color: "#fff" });
      },
      statElId: "stat-od-priority"
    });

    await loadProblems();

    if (homeBounds && homeBounds.isValid()) {
      setSys("همه چیز آماده است ✅");
      toastShow("لایه‌ها بارگذاری شدند ✅", "ok");
    } else {
      setSys("محدوده معتبر پیدا نشد. مسیر فایل‌ها یا ساختار GeoJSON را چک کنید.");
      toastShow("لود شد، ولی محدوده معتبر پیدا نشد", "err");
    }

    loader(false);

    map.on("overlayadd", (event) => {
      if (event.layer === landuseLayer) {
        loadLanduseOnDemand();
      }
    });

    document.getElementById("btn-home")?.addEventListener("click", () => {
      if (homeBounds?.isValid()) {
        map.fitBounds(homeBounds, { padding: [20, 20] });
      }
    });

    document.getElementById("btn-locate")?.addEventListener("click", () => {
      map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    });

    document.getElementById("btn-landuse")?.addEventListener("click", async () => {
      registerLanduseLayer();

      if (!landuseLayer) {
        return toastShow("لایه کاربری اراضی آماده نیست", "err");
      }

      if (map.hasLayer(landuseLayer)) {
        map.removeLayer(landuseLayer);
        toastShow("کاربری اراضی خاموش شد", "ok");
        return;
      }

      landuseLayer.addTo(map);
      await loadLanduseOnDemand();
      toastShow("کاربری اراضی روشن شد ✅", "ok");
    });

    map.on("locationfound", (e) => {
      if (!userLocMarker) {
        userLocMarker = L.circleMarker(e.latlng, { radius: 7, weight: 2 }).addTo(map);
      } else {
        userLocMarker.setLatLng(e.latlng);
      }

      userLocMarker.bindPopup("موقعیت شما").openPopup();
      toastShow("موقعیت پیدا شد ✅", "ok");
      if (typeof showNearestBus === "function") showNearestBus(e.latlng, "نزدیک‌ترین ایستگاه به موقعیت شما");
    });

    map.on("locationerror", () => {
      toastShow("دسترسی به موقعیت فعال نیست یا خطا دارد", "err");
    });

    document.getElementById("btn-bus-coverage")?.addEventListener("click", () => {
      if (typeof clearCoverage === "function") clearCoverage();
      if (!busLayer) return toastShow("لایه اتوبوس آماده نیست", "err");

      if (typeof buildCoverageBuffer === "function") {
        busCoverageLayer = buildCoverageBuffer(busLayer, 300, {
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.16
        }).addTo(map);
      }
      toastShow("پوشش ۳۰۰ متری اتوبوس ✅", "ok");
    });

    document.getElementById("btn-taxi-coverage")?.addEventListener("click", () => {
      if (typeof clearCoverage === "function") clearCoverage();
      if (!taxiLayer) return toastShow("لایه تاکسی آماده نیست", "err");

      if (typeof buildCoverageBuffer === "function") {
        taxiCoverageLayer = buildCoverageBuffer(taxiLayer, 500, {
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.14
        }).addTo(map);
      }
      toastShow("پوشش ۵۰۰ متری تاکسی ✅", "ok");
    });

    document.getElementById("btn-heat")?.addEventListener("click", () => {
      if (!busLayer) return toastShow("لایه اتوبوس آماده نیست", "err");
      if (!L.heatLayer) return toastShow("کتابخانه leaflet-heat لود نشده است", "err");

      busHeatOn = !busHeatOn;

      if (busHeatOn) {
        if (busHeatLayer) map.removeLayer(busHeatLayer);

        if (typeof buildHeat === "function") {
          busHeatLayer = buildHeat(busLayer, {
            radius: 38,
            blur: 30,
            intensity: 0.9,
            minOpacity: 0.42
          });
        }

        if (!busHeatLayer) {
          return toastShow("نقطه‌ای برای Heatmap اتوبوس پیدا نشد", "err");
        }

        busHeatLayer.addTo(map);

        if (map.hasLayer(busCluster)) {
          map.removeLayer(busCluster);
        }

        toastShow("Heatmap اتوبوس فعال شد؛ مارکرها موقتاً مخفی شدند 🔥", "ok");
      } else {
        if (busHeatLayer) map.removeLayer(busHeatLayer);
        busHeatLayer = null;

        if (!map.hasLayer(busCluster)) {
          busCluster.addTo(map);
        }
        toastShow("Heatmap اتوبوس خاموش شد", "ok");
      }
    });

    document.getElementById("btn-problem-heat")?.addEventListener("click", () => {
      if (!problemsData) return toastShow("لایه مشکلات آماده نیست", "err");
      if (!L.heatLayer) return toastShow("کتابخانه leaflet-heat لود نشده است", "err");

      problemHeatOn = !problemHeatOn;

      if (problemHeatOn) {
        if (problemHeatLayer) map.removeLayer(problemHeatLayer);

        if (typeof buildWeightedProblemHeat === "function") {
          problemHeatLayer = buildWeightedProblemHeat(window.filteredProblems());
        }

        if (!problemHeatLayer) {
          return toastShow("نقطه‌ای برای Heatmap مشکلات پیدا نشد", "err");
        }

        problemHeatLayer.addTo(map);
        hideProblemLayerTemporarily();

        toastShow("Heatmap فشار خدمات شهری فعال شد 🔥", "ok");
      } else {
        if (problemHeatLayer) map.removeLayer(problemHeatLayer);
        problemHeatLayer = null;
        showProblemLayerIfNeeded();

        toastShow("Heatmap مشکلات خاموش شد", "ok");
      }
    });

    document.getElementById("btn-digital-twin")?.addEventListener("click", () => {
      if (!problemsData) {
        return toastShow("لایه مشکلات شهری هنوز آماده نیست", "err");
      }

      if (!window.DigitalTwin) {
        return toastShow("موتور دوقلوی دیجیتال بارگذاری نشده است", "err");
      }

      twinMode = !twinMode;

      if (problemHeatLayer) {
        map.removeLayer(problemHeatLayer);
        problemHeatLayer = null;
        problemHeatOn = false;
      }

      if (typeof renderProblems === "function") renderProblems();
      setTwinButtonState();

      if (twinMode) {
        showTwinPanel();

        const b = problemsLayer?.getBounds?.();
        if (b?.isValid()) {
          map.fitBounds(b, { padding: [35, 35] });
        }

        setSys(buildTwinStatusText() || "سناریو اقدام فعال است؛ روی نقاط مشکلات شهری کلیک کنید.");
        toastShow("حالت سناریو اقدام فعال شد 🎯", "ok");
      } else {
        removeTwinPanel();
        setSys("همه چیز آماده است ✅");
        toastShow("حالت سناریو اقدام خاموش شد", "ok");
      }
    });

    document.getElementById("btn-all-problems")?.addEventListener("click", () => {
      activeProblemCategory = null;
      if (typeof renderProblems === "function") renderProblems();
      if (typeof markActiveCategory === "function") markActiveCategory();

      if (twinMode) showTwinPanel();
      toastShow("همه مشکلات نمایش داده شدند", "ok");
    });

    document.getElementById("btn-hide-problems")?.addEventListener("click", () => {
      if (!problemsLayer) return;

      if (map.hasLayer(problemsLayer)) {
        map.removeLayer(problemsLayer);
        removeTwinPanel();
        toastShow("لایه مشکلات خاموش شد", "ok");
      } else {
        problemsLayer.addTo(map);
        if (twinMode) showTwinPanel();
        toastShow("لایه مشکلات روشن شد", "ok");
      }
    });

    document.getElementById("btn-clear")?.addEventListener("click", () => {
      clearSelection();
      if (typeof clearNearest === "function") clearNearest();
      if (typeof clearCoverage === "function") clearCoverage();
      if (typeof clearHeat === "function") clearHeat();
      removeTwinPanel();

      if (busCluster && !map.hasLayer(busCluster)) {
        busCluster.addTo(map);
      }

      if (problemsLayer && !map.hasLayer(problemsLayer)) {
        problemsLayer.addTo(map);
      }

      if (twinMode) showTwinPanel();

      map.closePopup();
      toastShow("پاک شد ✅", "ok");
    });

    map.on("click", (e) => {
      clearSelection();
      if (busStopsIndex.length && typeof showNearestBus === "function") {
        showNearestBus(e.latlng, "نزدیک‌ترین ایستگاه به نقطه کلیک");
      }
    });

    map.on("zoomend", () => {
      const z = map.getZoom();
      const r = z <= 12 ? 3 : z <= 14 ? 5 : 7;

      busLayer?.eachLayer((l) => l.setStyle?.({ radius: r }));
      taxiLayer?.eachLayer((l) => l.setStyle?.({ radius: r }));
      fuelLayer?.eachLayer((l) => l.setStyle?.({ radius: r }));
      hospitalLayer?.eachLayer((l) => l.setStyle?.({ radius: Math.max(6, r + 1) }));
    });
  }

  init().catch((error) => {
    console.error("init error:", error);
    loader(false);
    setSys("خطای جاوااسکریپت رخ داد. Console مرورگر را بررسی کنید.");
    toastShow("خطای اجرای برنامه", "err");
  });
