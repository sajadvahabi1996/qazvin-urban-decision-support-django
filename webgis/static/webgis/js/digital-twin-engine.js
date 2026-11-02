// Digital twin analysis engine for the Qazvin urban decision-support interface.
// موتور تحلیلی دوقلوی دیجیتال شهری - نسخه زمینه‌مند با کاربری اراضی، حمل‌ونقل، زیرساخت و اولویت مداخله محلات (OD)
(function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  const context = {
    hospitals: [],
    landuse: [],
    bus: [],
    taxi: [],
    fuel: [],
    odPriority: [] // اضافه شدن لایه اولویت مداخله محلات
  };

  let lastSummary = null;

  function featureArray(input) {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (Array.isArray(input.features)) return input.features;
    return [];
  }

  function computeFeatureBBox(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function visitCoord(coord) {
      const x = Number(coord?.[0]);
      const y = Number(coord?.[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    function walk(value) {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === "number") visitCoord(value);
      else value.forEach(walk);
    }
    walk(geometry.coordinates);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return [minX, minY, maxX, maxY];
  }

  function pointInBBox(point, bbox) {
    if (!point || !bbox) return true;
    const x = Number(point[0]);
    const y = Number(point[1]);
    return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
  }

  function computeCoordsBBox(coords) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(value) {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === "number") {
        const x = Number(value[0]);
        const y = Number(value[1]);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      } else value.forEach(walk);
    }
    walk(coords);
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return [minX, minY, maxX, maxY];
  }

  function preparePolygonParts(feature) {
    const geometry = feature?.geometry;
    if (!geometry) return [];
    if (geometry.type === "Polygon") {
      return [{ coordinates: geometry.coordinates, bbox: computeCoordsBBox(geometry.coordinates) }];
    }
    if (geometry.type === "MultiPolygon") {
      return geometry.coordinates.map((polygon) => ({ coordinates: polygon, bbox: computeCoordsBBox(polygon) }));
    }
    return [];
  }

  // آماده‌سازی و ایندکس‌گذاری کلیه لایه‌های پلیگونی (کاربری اراضی و محلات OD)
  function preparePolygonFeature(feature) {
    return { ...feature, __bbox: feature.__bbox || computeFeatureBBox(feature), __parts: feature.__parts || preparePolygonParts(feature) };
  }

  function setContext(nextContext = {}) {
    if (Array.isArray(nextContext.hospitals)) context.hospitals = nextContext.hospitals;
    else if (Array.isArray(nextContext.hospitals?.features)) context.hospitals = nextContext.hospitals.features;

    if (Array.isArray(nextContext.landuse)) context.landuse = nextContext.landuse.map(preparePolygonFeature);
    else if (Array.isArray(nextContext.landuse?.features)) context.landuse = nextContext.landuse.features.map(preparePolygonFeature);

    if (Array.isArray(nextContext.bus)) context.bus = nextContext.bus;
    else if (Array.isArray(nextContext.bus?.features)) context.bus = nextContext.bus.features;

    if (Array.isArray(nextContext.taxi)) context.taxi = nextContext.taxi;
    else if (Array.isArray(nextContext.taxi?.features)) context.taxi = nextContext.taxi.features;

    if (Array.isArray(nextContext.fuel)) context.fuel = nextContext.fuel;
    else if (Array.isArray(nextContext.fuel?.features)) context.fuel = nextContext.fuel.features;

    // بارگذاری و ایندکس مکانی لایه اولویت مداخله محلات (OD)
    if (Array.isArray(nextContext.odPriority)) context.odPriority = nextContext.odPriority.map(preparePolygonFeature);
    else if (Array.isArray(nextContext.odPriority?.features)) context.odPriority = nextContext.odPriority.features.map(preparePolygonFeature);
  }

  function pick(properties = {}, keys = []) {
    for (const key of keys) {
      if (properties[key] !== undefined && properties[key] !== null && String(properties[key]).trim() !== "") {
        return properties[key];
      }
    }
    return "";
  }

  function getProblemType(properties = {}) {
    return String(pick(properties, [
      "category", "Category", "cat", "problem_category", "type", "problem_type", "problemType",
      "دسته‌بندی", "دسته بندی", "title", "name"
    ]) || "سایر/نیازمند بررسی دستی");
  }

  function getProblemTitle(properties = {}) {
    return String(pick(properties, ["title", "name", "category", "Category", "type", "عنوان", "شرح", "message", "متن پیام"])
      || "گزارش شهری");
  }

  function getProblemId(properties = {}, index = 0) {
    return String(pick(properties, [
      "id", "ID", "objectid", "OBJECTID", "tracking_code", "tracking", "code", "کد پیگیری"
    ]) || `problem-${index}`);
  }

  function jalaliToGregorian(jy, jm, jd) {
    jy = Number(jy); jm = Number(jm); jd = Number(jd);
    jy += 1595;
    let days = -355668 + (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;
    days += jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186;
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days += 1;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    const gd = days + 1;
    const salA = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 1;
    let day = gd;
    while (gm <= 12 && day > salA[gm]) day -= salA[gm++];
    return [gy, gm, day];
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const raw = String(value).trim();

    const faToEn = raw.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
    const m = faToEn.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
    if (m) {
      let y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const hh = Number(m[4] || 0);
      const mm = Number(m[5] || 0);
      if (y >= 1200 && y <= 1600) {
        const [gy, gm, gd] = jalaliToGregorian(y, mo, d);
        return new Date(gy, gm - 1, gd, hh, mm, 0);
      }
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getProblemAgeHours(properties = {}) {
    const dateValue = pick(properties, [
      "created_at", "createdAt", "registered_at", "date", "report_date", "reportDate", "timestamp",
      "تاریخ ثبت", "زمان ثبت", "زمان"
    ]);
    const created = parseDateValue(dateValue);
    if (!created) return 0;
    return Math.max(0, (new Date() - created) / (1000 * 60 * 60));
  }

  function getTypeWeight(type = "") {
    const t = String(type);
    if (t.includes("ساختمانی") || t.includes("ایمنی")) return 30;
    if (t.includes("داربست")) return 28;
    if (t.includes("سد معبر")) return 28;
    if (t.includes("ترافیک")) return 26;
    if (t.includes("مزاحمت")) return 24;
    if (t.includes("پارکینگ") || t.includes("حمل")) return 24;
    if (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری")) return 22;
    if (t.includes("آب‌گرفتگی") || t.includes("آب گرفتگی") || t.includes("فاضلاب")) return 22;
    if (t.includes("جوی")) return 20;
    if (t.includes("روشنایی") || t.includes("برق") || t.includes("تأسیسات")) return 20;
    if (t.includes("زباله") || t.includes("نخاله") || t.includes("نظافت")) return 18;
    if (t.includes("حیوانات") || t.includes("بهداشت")) return 18;
    if (t.includes("تابلو") || t.includes("مبلمان")) return 15;
    if (t.includes("فضای سبز") || t.includes("درخت")) return 14;
    return 12;
  }

  function getAgeScore(ageHours) {
    if (ageHours > 168) return 26;
    if (ageHours > 72) return 22;
    if (ageHours > 48) return 18;
    if (ageHours > 24) return 12;
    if (ageHours > 12) return 7;
    if (ageHours > 0) return 4;
    return 5;
  }

  function getDensityScore(nearbyCount) {
    if (nearbyCount > 50) return 27;
    if (nearbyCount > 40) return 24;
    if (nearbyCount > 25) return 19;
    if (nearbyCount > 12) return 13;
    if (nearbyCount > 5) return 7;
    return 2;
  }

  function getDataQuality(properties = {}) {
    const hasAddress = Boolean(pick(properties, ["address", "آدرس", "نشانی"]));
    const hasCategory = Boolean(pick(properties, ["category", "Category", "cat", "problem_category", "دسته‌بندی", "دسته بندی"]));
    const hasText = Boolean(pick(properties, ["message", "text", "متن پیام", "شرح پیام", "شرح"]));
    const hasTracking = Boolean(pick(properties, ["tracking_code", "tracking", "code", "کد پیگیری"]));
    const score = [hasAddress, hasCategory, hasText, hasTracking].filter(Boolean).length * 2;
    return { score, level: score >= 6 ? "بالا" : score >= 3 ? "متوسط" : "نیازمند تکمیل" };
  }

  function getRiskLevel(score) {
    if (score >= 81) return "بحرانی";
    if (score >= 61) return "بالا";
    if (score >= 31) return "متوسط";
    return "کم";
  }

  function getRiskColor(score) {
    if (score >= 81) return "#ef4444";
    if (score >= 61) return "#f97316";
    if (score >= 31) return "#eab308";
    return "#38bdf8";
  }

  function getActionWindow(score) {
    if (score >= 81) return "کمتر از ۴ ساعت";
    if (score >= 61) return "امروز / کمتر از ۲۴ ساعت";
    if (score >= 31) return "۴۸ تا ۷۲ ساعت آینده";
    return "پایش دوره‌ای";
  }

  function getCoordinates(feature) {
    if (!feature?.geometry) return null;
    if (feature.geometry.type === "Point") return feature.geometry.coordinates;
    return null;
  }

  function distanceMeters(coordA, coordB) {
    if (!coordA || !coordB) return Infinity;
    const lon1 = Number(coordA[0]);
    const lat1 = Number(coordA[1]);
    const lon2 = Number(coordB[0]);
    const lat2 = Number(coordB[1]);
    if ([lon1, lat1, lon2, lat2].some((x) => !Number.isFinite(x))) return Infinity;
    const R = 6371000;
    const toRad = (degree) => (degree * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function nearestFeatureInfo(feature, list, radiusBreaks, nameKeys, fallbackName) {
    const center = getCoordinates(feature);
    const features = featureArray(list);
    if (!center || !features.length) return { name: "", distance: null, score: 0, reason: "" };
    let best = null;
    features.forEach((item) => {
      const dist = distanceMeters(center, getCoordinates(item));
      if (!Number.isFinite(dist)) return;
      const name = String(pick(item.properties || {}, nameKeys) || fallbackName || "نقطه خدماتی");
      if (!best || dist < best.distance) best = { name, distance: dist };
    });
    if (!best) return { name: "", distance: null, score: 0, reason: "" };
    let score = 0;
    for (const row of radiusBreaks) {
      if (best.distance <= row.radius) { score = row.score; break; }
    }
    return { name: best.name, distance: Math.round(best.distance), score, reason: score ? `${fallbackName}: حدود ${Math.round(best.distance)} متر` : "" };
  }

  function normalizeRing(ring) {
    if (!Array.isArray(ring)) return [];
    return ring.map((coord) => [Number(coord?.[0]), Number(coord?.[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  }

  function pointInRing(point, ring) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygonCoordinates(point, polygonCoordinates) {
    if (!Array.isArray(polygonCoordinates) || !polygonCoordinates.length) return false;
    const outer = normalizeRing(polygonCoordinates[0]);
    if (outer.length < 3 || !pointInRing(point, outer)) return false;
    for (let i = 1; i < polygonCoordinates.length; i += 1) {
      const hole = normalizeRing(polygonCoordinates[i]);
      if (hole.length >= 3 && pointInRing(point, hole)) return false;
    }
    return true;
  }

  function pointInFeature(point, feature) {
    const geometry = feature?.geometry;
    if (!geometry || !point) return false;
    if (!pointInBBox(point, feature.__bbox)) return false;
    if (Array.isArray(feature.__parts) && feature.__parts.length) {
      return feature.__parts.some((part) => pointInBBox(point, part.bbox) && pointInPolygonCoordinates(point, part.coordinates));
    }
    if (geometry.type === "Polygon") return pointInPolygonCoordinates(point, geometry.coordinates);
    if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInPolygonCoordinates(point, polygon));
    return false;
  }

  function getLanduseValue(properties = {}) {
    return String(pick(properties, ["LU", "lu", "landuse", "LANDUSE", "LU_original", "کاربری", "نوع_کاربری"]) || "");
  }

  function getLanduseGroup(properties = {}) {
    const value = String(pick(properties, ["landuse_group", "group", "گروه", "گروه کاربری"]) || "");
    if (value) return value;
    const lu = getLanduseValue(properties);
    if (lu.includes("تجاری") || lu.includes("گردشگری")) return "تجاری/گردشگری";
    if (lu.includes("مسکونی")) return "مسکونی";
    if (lu.includes("آموزشی")) return "آموزشی";
    if (lu.includes("درمانی") || lu.includes("بهداشت")) return "درمانی";
    if (lu.includes("سبز") || lu.includes("پارک")) return "فضای سبز";
    if (lu.includes("حمل") || lu.includes("معبر") || lu.includes("پارکینگ")) return "حمل‌ونقل و معابر";
    if (lu.includes("تأسیسات") || lu.includes("زیرساخت")) return "تأسیسات/زیرساخت";
    if (lu.includes("صنعت") || lu.includes("کارگاه")) return "کارگاهی/صنعتی";
if (lu.includes("اداری") || lu.includes("اداری")) return "اداری";
    return lu || "نامشخص";
  }


  function getLanduseCode(properties = {}) {
    return String(pick(properties, ["LU_Code", "lu_code", "web_id", "code", "CODE", "کد"]) || "");
  }

  function getLanduseSensitivityScore(group = "", type = "") {
    const g = String(group || "");
    const t = String(type || "");
    if (!g || g === "نامشخص") return 2;
    if (g.includes("درمانی")) return 18;
    if (g.includes("آموزشی")) return 16;
    if (g.includes("حمل") || g.includes("معابر")) {
      if (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری") || t.includes("ترافیک") || t.includes("سد معبر") || t.includes("روشنایی")) return 18;
      return 12;
    }
    if (g.includes("تجاری") || g.includes("گردشگری")) {
      if (t.includes("سد معبر") || t.includes("مزاحمت")) return 18;
      if (t.includes("ترافیک") || t.includes("پارکینگ") || t.includes("حمل")) return 16;
      if (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری")) return 12;
      return 10;
    }
    if (g.includes("مسکونی")) {
      if (t.includes("ساختمانی") || t.includes("ایمنی") || t.includes("مزاحمت") || t.includes("بهداشت")) return 13;
      return 8;
    }
    if (g.includes("تأسیسات") || g.includes("زیرساخت")) return 13;
    if (g.includes("اداری") || g.includes("انتظامی")) return 10;
    if (g.includes("فضای سبز")) {
      if (t.includes("روشنایی") || t.includes("بهداشت") || t.includes("حیوانات") || t.includes("درخت") || t.includes("نخاله")) return 12;
      return 5;
    }
    if (g.includes("صنعتی") || g.includes("کارگاهی")) return 7;
    return 4;
  }

  function getLanduseInfo(feature, type = "") {
    const center = getCoordinates(feature);
    const props = feature.properties || {};
    if (!center || !context.landuse.length) {
      const embeddedGroup = props.twin_landuse_group || props.landuse_group || props.context_landuse_group || "";
      const embeddedLanduse = props.twin_landuse || getLanduseValue(props) || embeddedGroup;
      const score = getLanduseSensitivityScore(embeddedGroup || embeddedLanduse, type);
      return { landuse: embeddedLanduse, group: embeddedGroup || embeddedLanduse, code: getLanduseCode(props), score, reason: score ? `حساسیت کاربری زمین: ${embeddedGroup || embeddedLanduse}` : "" };
    }
    let found = null;
    let bestArea = Infinity;
    for (const landuseFeature of context.landuse) {
      const parts = Array.isArray(landuseFeature.__parts) ? landuseFeature.__parts : [];
      for (const part of parts) {
        if (!pointInBBox(center, part.bbox)) continue;
        const area = Math.abs((part.bbox[2] - part.bbox[0]) * (part.bbox[3] - part.bbox[1]));
        if (area < bestArea) {
          bestArea = area;
          found = landuseFeature;
        }
      }
    }
    if (!found) found = context.landuse.find((landuseFeature) => pointInFeature(center, landuseFeature));
    if (!found) return { landuse: "خارج از پهنه‌های ثبت‌شده", group: "نامشخص", code: "", score: 2, reason: "کاربری دقیق برای این نقطه پیدا نشد" };
    const p = found.properties || {};
    const landuse = getLanduseValue(p);
    const group = getLanduseGroup(p);
    const code = getLanduseCode(p);
    const score = getLanduseSensitivityScore(group, type);
    return { landuse, group, code, score, reason: score ? `حساسیت کاربری: ${group}${landuse && landuse !== group ? ` / ${landuse}` : ""}` : "" };
  }

  // پیدا کردن محله و مشخصات مداخله (OD) برای یک گزارش شهری
  function getODInfo(feature) {
    const center = getCoordinates(feature);
    if (!center || !context.odPriority || !context.odPriority.length) {
      const embeddedName = feature.properties?.twin_od_neighborhood || feature.properties?.name || "";
      const embeddedPressure = Number(feature.properties?.twin_od_pressure_norm || 0);
      const score = embeddedPressure >= 75 ? 12 : embeddedPressure >= 55 ? 6 : 0;
      return { name: embeddedName, pressure: embeddedPressure, flow: Number(feature.properties?.twin_od_flow_count || 0), score, reason: score ? `اولویت مداخله محله (${embeddedName}): شاخص ${Math.round(embeddedPressure)}` : "" };
    }
    let found = null;
    let bestArea = Infinity;
    for (const odFeature of context.odPriority) {
      const parts = Array.isArray(odFeature.__parts) ? odFeature.__parts : [];
      for (const part of parts) {
        if (!pointInBBox(center, part.bbox)) continue;
        const area = Math.abs((part.bbox[2] - part.bbox[0]) * (part.bbox[3] - part.bbox[1]));
        if (area < bestArea) {
          bestArea = area;
          found = odFeature;
        }
      }
    }
    if (!found) found = context.odPriority.find((odFeature) => pointInFeature(center, odFeature));
    if (!found) return { name: "خارج از محدوده محلات", pressure: 0, flow: 0, score: 0, reason: "" };
    
    const p = found.properties || {};
    const name = String(pick(p, ["name", "NAME", "نام", "محله", "title"]) || "محله نامشخص");
    const pressure = Number(p.od_pressure_norm || p.pressure || 0);
    const flow = Number(p.flow_count || p.flow || 0);
    const score = pressure >= 75 ? 12 : pressure >= 55 ? 6 : 0;
    return { name, pressure, flow, score, reason: score ? `اولویت مداخله محله (${name}): شاخص ${Math.round(pressure)}` : "" };
  }

  function getContextCompatibility(type, group) {
    const t = String(type || "");
    const g = String(group || "");
    let score = 0;
    let label = "عادی";
    let reason = "الگوی مکانی این گزارش با بافت اطراف در محدوده عادی ارزیابی شد.";

    const set = (s, l, r) => { score = Math.max(score, s); label = l; reason = r; };

    if (g.includes("درمانی") || g.includes("آموزشی")) {
      if (t.includes("ترافیک") || t.includes("آسفالت") || t.includes("چاله") || t.includes("روشنایی") || t.includes("بهداشت") || t.includes("سد معبر") || t.includes("آب")) {
        set(14, "حساس", "قرارگیری مشکل در بافت آموزشی/درمانی، اولویت ایمنی و دسترسی را افزایش می‌دهد.");
      }
    }
    if (g.includes("تجاری") && (t.includes("سد معبر") || t.includes("مزاحمت") || t.includes("پارکینگ") || t.includes("ترافیک"))) {
      set(12, "پرتکرار و عملیاتی", "در بافت تجاری/گردشگری احتمال تکرار این نوع مشکل در ساعات اوج فعالیت بالاست.");
    }
    if (g.includes("مسکونی") && (t.includes("مزاحمت") || t.includes("ساختمانی") || t.includes("بهداشت") || t.includes("نخاله"))) {
      set(10, "حساس محله‌ای", "اثر مستقیم بر آسایش سکونتی دارد و بهتر است با اولویت محله‌ای بررسی شود.");
    }
    if ((g.includes("حمل") || g.includes("معابر")) && (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری") || t.includes("ترافیک") || t.includes("روشنایی") || t.includes("آب"))) {
      set(13, "عملیاتی", "این مشکل در بافت حمل‌ونقل/معابر می‌تواند بر جریان تردد و ایمنی اثر مستقیم داشته باشد.");
    }
    if (g.includes("فضای سبز") && (t.includes("بهداشت") || t.includes("حیوانات") || t.includes("روشنایی") || t.includes("درخت") || t.includes("نخاله"))) {
      set(9, "حساس محیطی", "ماهیت مشکل با نگهداشت فضای عمومی و ایمنی محیطی مرتبط است.");
    }
    return { score, label, reason };
  }

  function countNearbyProblems(feature, allProblems, radiusMeters = 300) {
    const center = getCoordinates(feature);
    if (!center) return 0;
    let count = 0;
    allProblems.forEach((item) => {
      if (item === feature) return;
      if (distanceMeters(center, getCoordinates(item)) <= radiusMeters) count += 1;
    });
    return count;
  }

  function buildSpatialPrecompute(features) {
    const coords = features.map((feature) => getCoordinates(feature));
    const types = features.map((feature) => getProblemType(feature.properties || {}));
    const nearby300 = new Array(features.length).fill(0);
    const sameType450 = new Array(features.length).fill(0);
    const cellSize = 0.0010;
    const grid = new Map();
    const typeGrid = new Map();

    function getCell(coord) {
      return [Math.floor(Number(coord[0]) / cellSize), Math.floor(Number(coord[1]) / cellSize)];
    }
    function key(cx, cy) { return `${cx}:${cy}`; }

    coords.forEach((coord, index) => {
      if (!coord) return;
      const [cx, cy] = getCell(coord);
      const k = key(cx, cy);
      grid.set(k, (grid.get(k) || 0) + 1);
      const tk = `${k}:${types[index]}`;
      typeGrid.set(tk, (typeGrid.get(tk) || 0) + 1);
    });

    coords.forEach((coord, index) => {
      if (!coord) return;
      const [cx, cy] = getCell(coord);
      let nearby = 0;
      let sameType = 0;
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          const k = key(cx + dx, cy + dy);
          nearby += grid.get(k) || 0;
          sameType += typeGrid.get(`${k}:${types[index]}`) || 0;
        }
      }
      nearby300[index] = Math.max(0, nearby - 1);
      sameType450[index] = Math.max(0, sameType - 1);
    });

    return { nearby300, sameType450 };
  }

  function getPrediction72h(score, nearbyCount, ageHours, compatibilityScore = 0) {
    const ageFactor = Math.min(Number(ageHours || 0), 168) / 168;
    const densityFactor = Math.min(Number(nearbyCount || 0), 30) / 30;
    const riskFactor = Number(score || 0) / 100;
    const contextFactor = Math.min(Number(compatibilityScore || 0), 14) / 14;
    const predictionScore = clamp(Math.round((riskFactor * 0.47 + densityFactor * 0.28 + ageFactor * 0.15 + contextFactor * 0.10) * 100), 0, 100);
    let level = "پایدار";
    let trend = "کاهشی یا پایدار";
    let action = "پایش دوره‌ای کافی است.";
    if (predictionScore >= 76) { level = "احتمال تشدید بالا"; trend = "افزایشی"; action = "اقدام فعال در ۲۴ ساعت آینده پیشنهاد می‌شود."; }
    else if (predictionScore >= 56) { level = "نیازمند پایش جدی"; trend = "قابل افزایش"; action = "بررسی میدانی و اولویت‌دهی در ۴۸ تا ۷۲ ساعت آینده پیشنهاد می‌شود."; }
    else if (predictionScore >= 36) { level = "قابل پایش"; trend = "پایدار"; action = "پایش و رسیدگی عادی کافی است."; }
    return { score: predictionScore, probability: predictionScore, level, trend, action, text: `${level}؛ احتمال تشدید حدود ${predictionScore}٪ در ۷۲ ساعت آینده` };
  }

  function getTrend(score, nearbyCount, ageHours, contextScore = 0) {
    if (score >= 75 && (nearbyCount >= 20 || contextScore >= 12)) return "افزایشی";
    if (score >= 60 && ageHours >= 72) return "افزایشی";
    if (score >= 31) return "پایدار";
    return "کم‌ریسک";
  }

  function getLanduseRecommendation(type, group) {
    const t = String(type || "");
    const g = String(group || "");
    if (g.includes("درمانی")) return "حفظ دسترسی اضطراری و رفع سریع عامل اختلال در اطراف کاربری درمانی.";
    if (g.includes("آموزشی")) return "زمان‌بندی اقدام خارج از ساعات اوج ورود/خروج و توجه ویژه به ایمنی عابر.";
    if (g.includes("تجاری") && (t.includes("سد معبر") || t.includes("مزاحمت"))) return "کنترل میدانی در ساعات اوج فعالیت و ساماندهی مانع یا مزاحمت صنفی.";
    if (g.includes("حمل") || g.includes("معابر")) return "بررسی اثر بر جریان تردد، ایمن‌سازی موقت و رسیدگی براساس نقش شبکه معابر.";
    if (g.includes("مسکونی")) return "اولویت‌دهی محله‌ای با تمرکز بر کاهش مزاحمت، ایمنی و کیفیت زندگی ساکنان.";
    return "رسیدگی براساس نوع مشکل و پایش تکرارپذیری در همین محدوده.";
  }

  function getRecommendation(score, type = "", group = "") {
    const contextText = getLanduseRecommendation(type, group);
    const t = String(type);
    if (score >= 81) {
      if (t.includes("ساختمانی") || t.includes("ایمنی")) return `ارجاع فوری به بازرسی ایمنی و بررسی میدانی اضطراری. ${contextText}`;
      if (t.includes("ترافیک") || t.includes("حمل")) return `اعزام تیم حمل‌ونقل و کنترل میدانی محورهای پرتردد. ${contextText}`;
      return `ارجاع فوری به تیم عملیاتی و بررسی میدانی در کمتر از ۴ ساعت. ${contextText}`;
    }
    if (score >= 61) {
      if (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری")) return `ثبت دستورکار عمرانی و اولویت رسیدگی امروز. ${contextText}`;
      if (t.includes("سد معبر")) return `ارجاع به تیم اجرائیات و رفع مانع در محدوده پرتراکم. ${contextText}`;
      return `اولویت رسیدگی بالا و ثبت دستورکار برای منطقه مربوطه. ${contextText}`;
    }
    if (score >= 31) return `پایش و برنامه‌ریزی برای رسیدگی عادی. ${contextText}`;
    return `ثبت در صف بررسی و پایش دوره‌ای. ${contextText}`;
  }

  function getScenarioSteps(type = "", score = 0, group = "") {
    const t = String(type);
    const steps = [];
    if (group.includes("درمانی")) steps.push("کنترل عدم انسداد دسترسی درمانی");
    if (group.includes("آموزشی")) steps.push("تنظیم زمان اقدام با ساعات کم‌تردد آموزشی");
    if (group.includes("تجاری") || group.includes("گردشگری")) steps.push("پایش در بازه اوج فعالیت تجاری");
    if (group.includes("حمل") || group.includes("معابر")) steps.push("ایمن‌سازی موقت مسیر و کنترل جریان تردد");

    if (t.includes("آسفالت") || t.includes("چاله") || t.includes("حفاری")) steps.push("ثبت مأموریت برای تیم عمرانی", "بازدید میدانی و تعیین محدوده ایمن‌سازی", "ثبت نتیجه رسیدگی و به‌روزرسانی وضعیت");
    else if (t.includes("سد معبر") || t.includes("مزاحمت")) steps.push("ارجاع به واحد اجرائیات شهری", "بازدید میدانی از محدوده", "رفع مانع یا صدور اخطار", "پایش مجدد پس از اقدام");
    else if (t.includes("ترافیک") || t.includes("پارکینگ") || t.includes("حمل")) steps.push("بررسی اثر مشکل بر جریان تردد", "هماهنگی با حمل‌ونقل و ترافیک", "اعمال کنترل موقت", "پایش اثر اقدام");
    else if (t.includes("زباله") || t.includes("نخاله") || t.includes("نظافت") || t.includes("بهداشت")) steps.push("ارجاع به خدمات شهری", "اعزام اکیپ پاکسازی", "ثبت عکس یا گزارش پایان کار", "پایش تکرارپذیری مشکل");
    else if (score >= 81) steps.push("ارجاع فوری به واحد مسئول", "بررسی میدانی فوری", "ثبت اقدام اصلاحی", "پایش مجدد پس از اقدام");
    else steps.push("ثبت در صف بررسی", "تعیین واحد مسئول", "برنامه‌ریزی رسیدگی", "به‌روزرسانی وضعیت پس از اقدام");

    return [...new Set(steps)].slice(0, 6);
  }

  function getScenarioCostLevel(score, mode) {
    if (mode === "immediate") return score >= 70 ? "بالا" : "متوسط";
    if (mode === "normal") return "متوسط";
    return "کم";
  }

  function buildActionScenarios(type = "", score = 0, nearbyCount = 0, ageHours = 0, group = "") {
    const contextText = getLanduseRecommendation(type, group);
    const immediateImpact = clamp(Math.round(score * 0.55 + Math.min(nearbyCount, 25) * 0.7), 35, 82);
    const normalImpact = clamp(Math.round(score * 0.37 + Math.min(nearbyCount, 25) * 0.45), 22, 58);
    const monitorImpact = clamp(Math.round(score * 0.16 + Math.min(ageHours, 168) * 0.04), 8, 28);
    return [
      { id: "immediate", title: "اقدام فوری", priority: score >= 70 ? "بسیار بالا" : "بالا", timeWindow: score >= 81 ? "کمتر از ۴ ساعت" : "امروز", cost: getScenarioCostLevel(score, "immediate"), estimatedImpact: immediateImpact, residualRisk: clamp(score - immediateImpact, 0, 100), description: `اعزام یا ارجاع سریع به واحد مسئول برای کاهش فوری ریسک محدوده. ${contextText}`, steps: getScenarioSteps(type, Math.max(score, 81), group).slice(0, 4) },
      { id: "normal", title: "اقدام برنامه‌ریزی‌شده", priority: score >= 61 ? "بالا" : "متوسط", timeWindow: "۴۸ تا ۷۲ ساعت آینده", cost: getScenarioCostLevel(score, "normal"), estimatedImpact: normalImpact, residualRisk: clamp(score - normalImpact, 0, 100), description: `ثبت در دستورکار منطقه و رسیدگی مرحله‌ای با کنترل تراکم گزارش‌های اطراف. ${contextText}`, steps: getScenarioSteps(type, score, group).slice(0, 4) },
      { id: "monitor", title: "پایش هوشمند", priority: score >= 61 ? "متوسط" : "پایین", timeWindow: "یک هفته آینده", cost: getScenarioCostLevel(score, "monitor"), estimatedImpact: monitorImpact, residualRisk: clamp(score - monitorImpact, 0, 100), description: `مانیتورینگ محدوده و فعال شدن هشدار در صورت افزایش تراکم، قدمت یا حساسیت کاربری. ${contextText}`, steps: ["پایش روزانه محدوده", "بررسی ثبت گزارش مشابه", "به‌روزرسانی امتیاز ریسک", "ارجاع در صورت افزایش ریسک"] }
    ];
  }

  function getExpectedImpact(score) {
    if (score >= 81) return "کاهش ریسک محدوده از بحرانی به بالا یا متوسط";
    if (score >= 61) return "کاهش ریسک محدوده از بالا به متوسط";
    if (score >= 31) return "کنترل ریسک و جلوگیری از بحرانی شدن";
    return "حفظ وضعیت پایدار و پایش دوره‌ای";
  }

  function calculateProblemRisk(feature, allProblems = [], index = 0, precomputed = {}) {
    const properties = feature.properties || {};
    const type = getProblemType(properties);
    const title = getProblemTitle(properties);
    const id = getProblemId(properties, index);
    const ageHours = getProblemAgeHours(properties);
    const nearbyProblems = Array.isArray(precomputed.nearby300) ? precomputed.nearby300[index] : countNearbyProblems(feature, allProblems, 300);
    const dataQuality = getDataQuality(properties);
    const landuseInfo = getLanduseInfo(feature, type);
    const compatibility = getContextCompatibility(type, landuseInfo.group);
    const odInfo = getODInfo(feature); // دریافت وضعیت اولویت مداخله محله (OD)
    
    const hospitalInfo = nearestFeatureInfo(feature, context.hospitals, [{ radius: 100, score: 18 }, { radius: 300, score: 13 }, { radius: 500, score: 8 }, { radius: 800, score: 4 }], ["name", "Name", "NAME", "title", "نام"], "مرکز درمانی");
    const busInfo = nearestFeatureInfo(feature, context.bus, [{ radius: 80, score: 8 }, { radius: 160, score: 5 }, { radius: 300, score: 2 }], ["name", "Name", "OBJECTID"], "ایستگاه اتوبوس");
    const taxiInfo = nearestFeatureInfo(feature, context.taxi, [{ radius: 100, score: 6 }, { radius: 250, score: 3 }], ["name", "Name", "OBJECTID"], "ایستگاه تاکسی");
    const fuelInfo = nearestFeatureInfo(feature, context.fuel, [{ radius: 150, score: 8 }, { radius: 300, score: 4 }], ["name", "Name", "OBJECTID"], "جایگاه سوخت");

    const reasons = [];
    let score = 0;
    score += getTypeWeight(type); reasons.push(`نوع مشکل: ${type}`);
    score += getAgeScore(ageHours); reasons.push(ageHours > 0 ? `قدمت گزارش: حدود ${Math.round(ageHours)} ساعت` : "تاریخ گزارش ثبت نشده یا قابل خواندن نیست");
    score += getDensityScore(nearbyProblems); reasons.push(nearbyProblems > 5 ? `تراکم اطراف: ${nearbyProblems} گزارش در شعاع ۳۰۰ متر` : `تراکم اطراف: ${nearbyProblems} گزارش نزدیک`);
    score += dataQuality.score; reasons.push(`کیفیت داده: ${dataQuality.level}`);
    score += landuseInfo.score; if (landuseInfo.reason) reasons.push(landuseInfo.reason);
    score += compatibility.score; if (compatibility.score) reasons.push(compatibility.reason);
    
    // اضافه شدن امتیاز اولویت محلات به محاسبه ریسک
    if (odInfo.score) { score += odInfo.score; reasons.push(odInfo.reason); }

    if (hospitalInfo.score) { score += hospitalInfo.score; reasons.push(hospitalInfo.reason); }
    if (busInfo.score && (type.includes("ترافیک") || type.includes("حمل") || type.includes("سد معبر") || type.includes("آسفالت") || type.includes("چاله") || type.includes("روشنایی"))) { score += busInfo.score; reasons.push(busInfo.reason); }
    if (taxiInfo.score && (type.includes("ترافیک") || type.includes("حمل") || type.includes("سد معبر") || type.includes("پارکینگ"))) { score += taxiInfo.score; reasons.push(taxiInfo.reason); }
    if (fuelInfo.score && (type.includes("آتش") || type.includes("ترافیک") || type.includes("روشنایی") || type.includes("برق") || type.includes("نشت") || type.includes("ایمنی"))) { score += fuelInfo.score; reasons.push(fuelInfo.reason); }

    score = clamp(Math.round(score), 0, 100);
    const prediction72h = getPrediction72h(score, nearbyProblems, ageHours, compatibility.score);
    const actionScenarios = buildActionScenarios(type, score, nearbyProblems, ageHours, landuseInfo.group);

    return {
      id, title, type, score, level: getRiskLevel(score), color: getRiskColor(score),
      ageHours: Math.round(ageHours), nearbyProblems, dataQuality: dataQuality.level,
      landuse: landuseInfo.landuse, landuseGroup: landuseInfo.group, landuseCode: landuseInfo.code,
      landuseSensitivityScore: landuseInfo.score, compatibilityScore: compatibility.score,
      compatibilityLabel: compatibility.label, compatibilityReason: compatibility.reason,
      odNeighborhood: odInfo.name, odPressureNorm: odInfo.pressure, odFlowCount: odInfo.flow, odScore: odInfo.score,
      nearestHospitalName: hospitalInfo.name, nearestHospitalDistance: hospitalInfo.distance, hospitalProximityScore: hospitalInfo.score,
      nearestBusDistance: busInfo.distance, busProximityScore: busInfo.score,
      nearestTaxiDistance: taxiInfo.distance, taxiProximityScore: taxiInfo.score,
      nearestFuelDistance: fuelInfo.distance, fuelProximityScore: fuelInfo.score,
      trend: getTrend(score, nearbyProblems, ageHours, compatibility.score), prediction72h, actionScenarios,
      actionWindow: getActionWindow(score), reasons,
      recommendation: getRecommendation(score, type, landuseInfo.group),
      scenarioSteps: getScenarioSteps(type, score, landuseInfo.group), expectedImpact: getExpectedImpact(score)
    };
  }

  function enrichProblemsWithTwinData(geojson, nextContext = {}) {
    setContext(nextContext);
    if (!geojson || !Array.isArray(geojson.features)) return geojson;
    const features = geojson.features;
    const precomputed = buildSpatialPrecompute(features);
    return {
      ...geojson,
      features: features.map((feature, index) => {
        const twin = calculateProblemRisk(feature, features, index, precomputed);
        return {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            twin_id: twin.id,
            twin_title: twin.title,
            twin_type: twin.type,
            twin_risk_score: twin.score,
            twin_risk_level: twin.level,
            twin_risk_color: twin.color,
            twin_nearby_count: twin.nearbyProblems,
            twin_same_type_nearby_450: precomputed.sameType450?.[index] || 0,
            twin_age_hours: twin.ageHours,
            twin_data_quality: twin.dataQuality,
            twin_landuse: twin.landuse,
            twin_landuse_group: twin.landuseGroup,
            twin_landuse_code: twin.landuseCode,
            twin_landuse_sensitivity_score: twin.landuseSensitivityScore,
            twin_context_compatibility_score: twin.compatibilityScore,
            twin_context_compatibility_label: twin.compatibilityLabel,
            twin_context_reason: twin.compatibilityReason,
            twin_od_neighborhood: twin.odNeighborhood, // اضافه شدن محله OD
            twin_od_pressure_norm: twin.odPressureNorm, // اضافه شدن شاخص فشار OD
            twin_od_flow_count: twin.odFlowCount, // اضافه شدن تعداد تردد/درخواست محله
            twin_nearest_hospital_name: twin.nearestHospitalName,
            twin_nearest_hospital_distance: twin.nearestHospitalDistance,
            twin_hospital_proximity_score: twin.hospitalProximityScore,
            twin_nearest_bus_distance: twin.nearestBusDistance,
            twin_bus_proximity_score: twin.busProximityScore,
            twin_nearest_taxi_distance: twin.nearestTaxiDistance,
            twin_taxi_proximity_score: twin.taxiProximityScore,
            twin_nearest_fuel_distance: twin.nearestFuelDistance,
            twin_fuel_proximity_score: twin.fuelProximityScore,
            twin_trend: twin.trend,
            twin_prediction_72h: twin.prediction72h,
            twin_prediction_score: twin.prediction72h.score,
            twin_escalation_probability: twin.prediction72h.probability,
            twin_action_scenarios: twin.actionScenarios,
            twin_action_window: twin.actionWindow,
            twin_reasons: twin.reasons,
            twin_recommendation: twin.recommendation,
            twin_scenario_steps: twin.scenarioSteps,
            twin_expected_impact: twin.expectedImpact
          }
        };
      })
    };
  }

  function aggregateBy(features, keyFn) {
    const map = {};
    features.forEach((f) => {
      const p = f.properties || {};
      const key = keyFn(p) || "نامشخص";
      const risk = Number(p.twin_risk_score || 0);
      const nearby = Number(p.twin_nearby_count || 0);
      if (!map[key]) map[key] = { key, category: key, count: 0, sumRisk: 0, avgRisk: 0, sumNearby: 0, avgNearby: 0, critical: 0, high: 0 };
      map[key].count += 1;
      map[key].sumRisk += risk;
      map[key].sumNearby += nearby;
      if (risk >= 81) map[key].critical += 1;
      else if (risk >= 61) map[key].high += 1;
    });
    const rows = Object.values(map).map((item) => ({ ...item, avgRisk: Math.round(item.sumRisk / item.count), avgNearby: Math.round(item.sumNearby / item.count) }));
    return {
      rows: rows.sort((a, b) => b.count - a.count),
      mostReported: [...rows].sort((a, b) => b.count - a.count)[0] || null,
      highestRisk: [...rows].sort((a, b) => b.avgRisk - a.avgRisk)[0] || null,
      mostDense: [...rows].sort((a, b) => b.avgNearby - a.avgNearby)[0] || null
    };
  }

  function buildCategoryAnalytics(features) {
    return aggregateBy(features, (p) => p.twin_type || getProblemType(p));
  }

  function buildLanduseAnalytics(features) {
    const base = aggregateBy(features, (p) => p.twin_landuse_group || p.twin_landuse || "نامشخص");
    const matrix = {};
    features.forEach((f) => {
      const p = f.properties || {};
      const group = p.twin_landuse_group || p.twin_landuse || "نامشخص";
      const type = p.twin_type || getProblemType(p);
      const key = `${group} × ${type}`;
      if (!matrix[key]) matrix[key] = { group, type, count: 0, sumRisk: 0, avgRisk: 0 };
      matrix[key].count += 1;
      matrix[key].sumRisk += Number(p.twin_risk_score || 0);
    });
    const matrixRows = Object.values(matrix).map((row) => ({ ...row, avgRisk: Math.round(row.sumRisk / row.count) }))
      .sort((a, b) => (b.count * 0.65 + b.avgRisk * 0.35) - (a.count * 0.65 + a.avgRisk * 0.35));
    return { ...base, matrixRows, dominantPair: matrixRows[0] || null, riskiestPair: [...matrixRows].sort((a, b) => b.avgRisk - a.avgRisk)[0] || null };
  }

  function detectAnomalies(features) {
    if (!Array.isArray(features) || features.length < 3) return [];
    const rows = features.map((feature) => {
      const p = feature.properties || {};
      return { feature, risk: Number(p.twin_risk_score || 0), nearby: Number(p.twin_nearby_count || 0), age: Number(p.twin_age_hours || 0), context: Number(p.twin_context_compatibility_score || 0), landuse: p.twin_landuse_group || "نامشخص", type: p.twin_type || getProblemType(p) };
    });
    const avg = (key) => rows.reduce((sum, item) => sum + item[key], 0) / rows.length;
    const riskAvg = avg("risk"), nearbyAvg = avg("nearby"), ageAvg = avg("age");
    return rows.map((item) => {
      const reasons = [];
      let anomalyScore = 0;
      if (item.risk >= Math.max(70, riskAvg + 18) && item.nearby >= nearbyAvg) { anomalyScore += 38; reasons.push("ریسک بالاتر از الگوی عمومی"); }
      if (item.nearby >= Math.max(15, nearbyAvg + 10)) { anomalyScore += 30; reasons.push("تراکم محلی غیرعادی"); }
      if (item.age >= Math.max(96, ageAvg + 48)) { anomalyScore += 18; reasons.push("قدمت زیاد نسبت به سایر گزارش‌ها"); }
      if (item.context >= 12) { anomalyScore += 18; reasons.push("ناسازگاری/حساسیت کاربری"); }
      if (!reasons.length) return null;
      item.feature.properties = { ...item.feature.properties, twin_anomaly_score: clamp(anomalyScore, 0, 100), twin_anomaly_reason: reasons.join("، ") };
      return item.feature;
    }).filter(Boolean).sort((a, b) => Number(b.properties?.twin_anomaly_score || 0) - Number(a.properties?.twin_anomaly_score || 0)).slice(0, 6);
  }

  function buildActionSimulation(summary) {
    if (!summary.total) return null;
    return {
      title: "شبیه‌سازی اثر اقدام روی فشار شهری",
      immediate: `رسیدگی فوری به ${summary.critical + summary.high} مورد پرریسک می‌تواند شاخص فشار را تا حدود ${Math.min(30, Math.round(summary.urbanPressureIndex * 0.32))} واحد کاهش دهد.`,
      normal: "اقدام برنامه‌ریزی‌شده برای موارد متوسط، ریسک تجمعی محله‌ها را کنترل می‌کند.",
      monitor: "پایش هوشمند برای موارد کم‌ریسک، هشدار زودهنگام در صورت افزایش تراکم یا تغییر بافت را فعال می‌کند.",
      recommendation: "اولویت با گزارش‌هایی است که هم ریسک بالا، هم تراکم اطراف و هم حساسیت کاربری/مداخله دارند."
    };
  }

  function buildTwinSummary(enrichedGeojson) {
    const features = enrichedGeojson?.features || [];
    const summary = {
      total: features.length, avgRisk: 0, critical: 0, high: 0, medium: 0, low: 0,
      urbanPressureIndex: 0, pressureStatus: "نامشخص", managementSummary: "داده‌ای برای تحلیل دوقلوی دیجیتال موجود نیست.",
      hotspots: [], anomalies: [], priorities: [], simulation: null,
      odAvgPressure: "فعال", // خروجی جدید برای نمایش در کارت داشبورد
      categoryAnalytics: { rows: [], mostReported: null, highestRisk: null, mostDense: null },
      landuseAnalytics: { rows: [], mostReported: null, highestRisk: null, mostDense: null, matrixRows: [], dominantPair: null, riskiestPair: null }
    };
    if (!features.length) { lastSummary = summary; return summary; }

    // محاسبه میانگین فشار محلات (OD) برای نمایش در داشبورد
    let odCriticalCount = 0;
    if (context.odPriority && context.odPriority.length > 0) {
      const totalNorm = context.odPriority.reduce((sum, f) => {
        const norm = Number(f.properties?.od_pressure_norm || f.properties?.pressure || 0);
        if (norm >= 70) odCriticalCount++;
        return sum + norm;
      }, 0);
      const avg = Math.round(totalNorm / context.odPriority.length);
      summary.odAvgPressure = String(avg).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) + "/۱۰۰";
    }

    let sum = 0;
    features.forEach((f) => {
      const score = Number(f.properties?.twin_risk_score || 0);
      sum += score;
      if (score >= 81) summary.critical += 1;
      else if (score >= 61) summary.high += 1;
      else if (score >= 31) summary.medium += 1;
      else summary.low += 1;
    });
    summary.avgRisk = Math.round(sum / features.length);
    const highRiskRatio = ((summary.critical + summary.high) / features.length) * 100;
    const denseItems = features.filter((f) => Number(f.properties?.twin_nearby_count || 0) >= 12).length;
    const hotspotDensity = (denseItems / features.length) * 100;
    const sensitiveContext = features.filter((f) => Number(f.properties?.twin_context_compatibility_score || 0) >= 10).length;
    const contextRatio = (sensitiveContext / features.length) * 100;
    summary.urbanPressureIndex = Math.min(100, Math.round(summary.avgRisk * 0.45 + highRiskRatio * 0.25 + hotspotDensity * 0.18 + contextRatio * 0.12));
    if (summary.urbanPressureIndex >= 75) summary.pressureStatus = "بحرانی";
    else if (summary.urbanPressureIndex >= 55) summary.pressureStatus = "نیازمند مداخله فعال";
    else if (summary.urbanPressureIndex >= 35) summary.pressureStatus = "قابل پایش";
    else summary.pressureStatus = "پایدار";

    summary.categoryAnalytics = buildCategoryAnalytics(features);
    summary.landuseAnalytics = buildLanduseAnalytics(features);
    const dominant = summary.categoryAnalytics.mostReported?.category || "مشکلات شهری";
    const riskiest = summary.categoryAnalytics.highestRisk?.category || dominant;
    const pressureLanduse = summary.landuseAnalytics.mostReported?.category || "نامشخص";
    const riskyLanduse = summary.landuseAnalytics.highestRisk?.category || pressureLanduse;
    const dominantPair = summary.landuseAnalytics.dominantPair;

    summary.hotspots = features.filter((f) => Number(f.properties?.twin_risk_score || 0) >= 45).map((feature) => {
      const p = feature.properties || {};
      const sameTypeNearby = Number(p.twin_same_type_nearby_450 || 0);
      const hotspotScore = clamp(Math.round(
        Number(p.twin_risk_score || 0) * 0.48 + Number(p.twin_nearby_count || 0) * 1.25 + sameTypeNearby * 3.0 + Math.min(Number(p.twin_age_hours || 0), 168) * 0.06 + Number(p.twin_context_compatibility_score || 0) * 1.1
      ), 0, 100);
      feature.properties = { ...p, twin_hotspot_score: hotspotScore, twin_same_type_nearby: sameTypeNearby };
      return feature;
    }).sort((a, b) => Number(b.properties?.twin_hotspot_score || 0) - Number(a.properties?.twin_hotspot_score || 0)).slice(0, 5);

    summary.anomalies = detectAnomalies(features);
    summary.simulation = buildActionSimulation(summary);
    summary.priorities = [...features].sort((a, b) => {
      const ap = a.properties || {}, bp = b.properties || {};
      const av = Number(ap.twin_risk_score || 0) * 0.62 + Number(ap.twin_nearby_count || 0) * 0.18 + Math.min(Number(ap.twin_age_hours || 0), 168) * 0.08 + Number(ap.twin_context_compatibility_score || 0) * 0.12;
      const bv = Number(bp.twin_risk_score || 0) * 0.62 + Number(bp.twin_nearby_count || 0) * 0.18 + Math.min(Number(bp.twin_age_hours || 0), 168) * 0.08 + Number(bp.twin_context_compatibility_score || 0) * 0.12;
      return bv - av;
    }).slice(0, 10);

    summary.managementSummary =
      `شاخص فشار خدمات شهری در وضعیت «${summary.pressureStatus}» قرار دارد. ` +
      `بیشترین حجم گزارش‌ها مربوط به «${dominant}» است و پرریسک‌ترین دسته فعلی «${riskiest}» تشخیص داده می‌شود. ` +
      `از نظر بافت شهری، بیشترین فشار روی کاربری «${pressureLanduse}» و پرریسک‌ترین بافت «${riskyLanduse}» است. ` +
      (dominantPair ? `ترکیب غالب مسئله-کاربری «${dominantPair.type}» در «${dominantPair.group}» با ${dominantPair.count} مورد است. ` : "") +
      (odCriticalCount > 0 ? `همچنین پایش محلات (OD) نشان می‌دهد که ${String(odCriticalCount).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d])} محله در وضعیت مداخله با اولویت بالا قرار دارند. ` : "") +
      `اولویت عملیاتی با نقاطی است که هم ریسک بالا، هم تراکم اطراف و هم حساسیت کاربری/مداخله دارند.`;

    lastSummary = summary;
    return summary;
  }

  function createProblemStyle(feature) {
    const score = Number(feature.properties?.twin_risk_score || 0);
    const color = feature.properties?.twin_risk_color || "#38bdf8";
    return { radius: score >= 81 ? 17 : score >= 61 ? 14 : score >= 31 ? 10 : 7, fillColor: color, color: "#ffffff", weight: 2.5, opacity: 1, fillOpacity: 0.92 };
  }

  window.DigitalTwin = {
    setContext,
    enrichProblemsWithTwinData,
    buildTwinSummary,
    createProblemStyle,
    getPrediction72h,
    detectAnomalies,
    getLastSummary: () => lastSummary
  };
})();