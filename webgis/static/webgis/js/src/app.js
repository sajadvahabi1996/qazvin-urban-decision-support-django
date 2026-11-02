// app.js - نقطه شروع برنامه
// بخش‌های برنامه در config.js، utils.js، map-layers.js و dashboard.js ثبت می‌شوند.

(() => {
  "use strict";

  const parts = window.QAZVINAPPPARTS || [];

  if (!parts.length) {
    console.error("Qazvin WebGIS: app parts were not loaded.");
    return;
  }

  try {
    parts.forEach((part, index) => {
      try {
        new Function(part);
      } catch (error) {
        console.error(
          "Syntax error in QAZVINAPPPARTS[" + index + "]",
          error
        );

        console.log("Broken code section:", part);

        throw error;
      }
    });

    eval(parts.join("\n\n/* app.js combined parts */\n\n"));
  } catch (error) {
    console.error("Qazvin WebGIS startup error:", error);

    const sys = document.getElementById("sys-msg");

    if (sys) {
      sys.textContent =
        "خطای JavaScript رخ داده است؛ Console را بررسی کنید.";
    }
  }
})();