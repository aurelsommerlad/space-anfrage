/*!
 * SPACE im HØV – Anfrageleiste: Kalender (Version 8)
 * Wird vom Elementor-Widget per <script src> geladen. Die Leiste selbst ist
 * HTML/CSS im Widget und bleibt ohne dieses Skript sichtbar.
 * Übergeben werden nur beginn, ende und personen – keine personenbezogenen Daten.
 */
(function () {
  "use strict";

  // Einstellungen kommen aus dem Widget-HTML:
  //   action="/space-anfrage/"     Adresse der WordPress-Formularseite
  //   data-header-offset="100"     Höhe eines fixierten Website-Headers in px
  var DEFAULT_TARGET = "/space-anfrage/";
  var DEFAULT_HEADER_OFFSET = 100;

  var VERSION = "8";
  var MAX_MONTHS_AHEAD = 24;
  var TWO_MONTHS_MIN_WIDTH = 760;
  var SELECTOR = "form[data-sa-leiste]";

  // Mehrere Widgets auf der Seite: nur einmal einrichten, danach nur neu scannen.
  var existing = window.SpaceAnfrageKalender;
  if (existing && existing.version === VERSION && typeof existing.scan === "function") { existing.scan(); return; }

  var MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  var WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  var WD_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];

  /* ---- Kalender-Darstellung (in eigener, abgeschotteter Ebene) ---- */
  var POP_CSS = [
    "*,*::before,*::after{box-sizing:border-box}",
    "[hidden]{display:none!important}",
    "p{margin:0;padding:0}",
    "button{font:inherit;color:inherit;margin:0;-webkit-appearance:none;appearance:none}",
    "svg{display:block;flex:none;fill:none}",
    ".pop{position:absolute;top:0;left:0;width:380px;margin:0;padding:18px 16px 14px;background:#fff;border:1px solid #e3e3e3;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.1),0 2px 6px rgba(0,0,0,.05);font-family:inherit;font-size:16px;line-height:1.4;color:#1e1e1e;text-align:left;outline:none;overscroll-behavior:contain}",
    ".pop.two{padding:22px 28px 18px}",
    ".nav{position:absolute;top:14px;display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;background:transparent;border:0;border-radius:50%;color:#1e1e1e;cursor:pointer;outline:none}",
    ".pop.two .nav{top:18px}",
    ".nav svg{width:18px;height:18px}",
    ".prev{left:10px}.next{right:10px}",
    ".nav:hover{background:#f3f3f3}",
    ".nav:focus-visible{outline:2px solid #1e1e1e}",
    ".nav[disabled]{visibility:hidden}",
    ".months{display:flex}",
    ".month{flex:1 1 0;min-width:0}",
    ".pop.two .month+.month{margin-left:28px;padding-left:28px;border-left:1px solid #e8e8e8}",
    ".title{height:40px;margin:0 0 6px;font-size:19px;font-weight:400;line-height:40px;text-align:center}",
    ".title strong{font-weight:700}",
    "table{width:100%;margin:0;border:0;border-collapse:separate;border-spacing:0 1px;table-layout:fixed}",
    "th,td{margin:0;padding:0;border:0;background:transparent;text-align:center;vertical-align:middle}",
    "th{height:28px;font-size:13px;font-weight:400;color:#74736e}",
    ".day{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:40px;padding:0;background:transparent;border:0;border-radius:0;color:#1e1e1e;font-size:15px;font-weight:400;line-height:1;font-variant-numeric:tabular-nums;cursor:pointer;outline:none}",
    ".day::before{content:'';position:absolute;top:1px;bottom:1px;left:0;right:0}",
    ".day>span{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;width:38px;max-width:100%;height:38px;border-radius:50%}",
    ".day.today>span{box-shadow:inset 0 0 0 1px #9a9a9a}",
    ".day[aria-disabled=true]{color:#c9c9c9;cursor:default}",
    ".day:not([aria-disabled=true]):hover>span{box-shadow:inset 0 0 0 1px #1e1e1e}",
    ".day.range::before{background:#ececec}",
    ".day.has-range.start::before{left:50%;background:#ececec}",
    ".day.has-range.end::before{right:50%;background:#ececec}",
    ".day.preview.range::before,.day.preview.has-range::before{background:#f4f4f4}",
    ".day.start>span,.day.end:not(.preview)>span{background:#1e1e1e;color:#fff;box-shadow:none}",
    ".day.end.preview>span{box-shadow:inset 0 0 0 1px #1e1e1e}",
    ".day.day:focus-visible>span{box-shadow:0 0 0 2px #fff,0 0 0 4px #1e1e1e}",
    ".foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;margin-top:10px;padding-top:14px;border-top:1px solid #ededed}",
    ".text{flex:1 1 200px;min-width:0}",
    ".hint{font-size:14px;color:#6b6b6b}",
    ".status{font-size:14px;color:#1e1e1e}",
    ".status:empty{display:none}",
    ".apply{height:44px;padding:0 22px;background:#1e1e1e;border:1px solid #1e1e1e;border-radius:2px;color:#fff;font-size:15px;font-weight:500;line-height:42px;white-space:nowrap;cursor:pointer;outline:none}",
    "@media (hover:hover){.apply:not([disabled]):hover{background:#3a3a3a;border-color:#3a3a3a}}",
    ".apply:focus-visible{outline:2px solid #1e1e1e;outline-offset:2px}",
    ".apply[disabled]{opacity:.35;cursor:default}",
    "@media (max-width:599px){.apply{width:100%}}"
  ].join("\n");

  var POP_HTML =
    '<div class="pop" role="dialog" aria-label="Datum oder Zeitraum wählen" tabindex="-1" hidden>' +
    '<button type="button" class="nav prev" aria-label="Vorheriger Monat"><svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M11 3.5 5.5 9l5.5 5.5" stroke="currentColor" stroke-width="1.5"/></svg></button>' +
    '<button type="button" class="nav next" aria-label="Nächster Monat"><svg viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M7 3.5 12.5 9 7 14.5" stroke="currentColor" stroke-width="1.5"/></svg></button>' +
    '<div class="months"></div>' +
    '<div class="foot"><div class="text"><p class="hint">Wähle einen Tag oder einen Zeitraum.</p><p class="status" aria-live="polite"></p></div>' +
    '<button type="button" class="apply" disabled>Übernehmen</button></div>' +
    "</div>";

  var POP_HOST_STYLE =
    "all:initial!important;display:block!important;position:fixed!important;top:0!important;left:0!important;" +
    "width:0!important;height:0!important;overflow:visible!important;z-index:2147483000!important;font-family:inherit!important;";

  /* ---- Datumshilfen: reine Kalendertage "YYYY-MM-DD", Europe/Berlin ---- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function iso(y, m, d) {
    var t = new Date(Date.UTC(y, m, d));
    return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
  }
  function parts(s) { var p = s.split("-"); return [+p[0], +p[1] - 1, +p[2]]; }
  function addDays(s, n) { var p = parts(s); return iso(p[0], p[1], p[2] + n); }
  function monthOf(s) { return s.slice(0, 7); }
  function addMonths(m, n) { var p = m.split("-"); return iso(+p[0], +p[1] - 1 + n, 1).slice(0, 7); }
  function weekday(s) { var p = parts(s); return (new Date(Date.UTC(p[0], p[1], p[2])).getUTCDay() + 6) % 7; }
  function daysInMonth(m) { var p = m.split("-"); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function todayBerlin() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
      var d = new Date();
      return iso(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  function fmt(s) { var p = parts(s); return pad(p[2]) + "." + pad(p[1] + 1) + "." + p[0]; }
  function fmtRange(a, b) {
    if (!b || a === b) return fmt(a);
    var pa = parts(a), pb = parts(b);
    if (pa[0] === pb[0] && pa[1] === pb[1]) return pad(pa[2]) + ".–" + fmt(b);
    if (pa[0] === pb[0]) return pad(pa[2]) + "." + pad(pa[1] + 1) + ".–" + fmt(b);
    return fmt(a) + "–" + fmt(b);
  }
  function countDays(a, b) {
    var pa = parts(a), pb = parts(b);
    return Math.round((Date.UTC(pb[0], pb[1], pb[2]) - Date.UTC(pa[0], pa[1], pa[2])) / 86400000) + 1;
  }
  function longLabel(s) { var p = parts(s); return WD_LONG[weekday(s)] + ", " + p[2] + ". " + MONTHS[p[1]] + " " + p[0]; }
  function isTwo() { return window.innerWidth >= TWO_MONTHS_MIN_WIDTH; }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function closestDay(t) { return t && t.closest ? t.closest(".day") : null; }
  function scrollParent(node) {
    for (var e = node.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      var oy = getComputedStyle(e).overflowY;
      if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight) return e;
    }
    return null;
  }
  function scrollByY(node, dy) {
    var sp = scrollParent(node);
    if (sp) sp.scrollTop += dy;
    else window.scrollBy(0, dy);
  }

  var instances = [];
  var openInstance = null;
  var modality = "pointer";
  var uid = 0;

  /* ---- Eine Leiste ---- */
  function createInstance(form) {
    var n = ++uid;
    var TARGET_URL = form.getAttribute("action") || DEFAULT_TARGET;
    var HEADER_OFFSET = parseInt(form.getAttribute("data-header-offset"), 10);
    if (isNaN(HEADER_OFFSET)) HEADER_OFFSET = DEFAULT_HEADER_OFFSET;
    var dateBtn = form.querySelector(".sa-leiste__date");
    var dateValue = form.querySelector(".sa-leiste__value");
    var guestsEl = form.querySelector(".sa-leiste__input");
    var dateErr = form.querySelector('[data-sa-error="date"]');
    var guestsErr = form.querySelector('[data-sa-error="guests"]');
    if (!dateBtn || !dateValue || !guestsEl || !dateErr || !guestsErr) throw new Error("Markup unvollständig");

    // Eindeutige IDs je Leiste (keine Konflikte bei mehreren Widgets).
    dateErr.id = "sa-leiste-" + n + "-date-error";
    guestsErr.id = "sa-leiste-" + n + "-guests-error";
    dateBtn.setAttribute("aria-describedby", dateErr.id);
    guestsEl.setAttribute("aria-describedby", guestsErr.id);

    // Kalender: eigene Ebene an <body> mit eigenem Shadow DOM.
    var popHost = document.createElement("div");
    popHost.setAttribute("data-sa-leiste-kalender", String(n));
    // Gleiche Schrift wie die Leiste (das Popover hängt am <body>, dessen Schrift abweichen kann).
    function syncFont() {
      var barFont = "";
      try { barFont = getComputedStyle(form).fontFamily || ""; } catch (e) { barFont = ""; }
      popHost.setAttribute("style", POP_HOST_STYLE + (barFont ? "font-family:" + barFont.replace(/[;!{}<>]/g, "") + "!important;" : ""));
    }
    syncFont();
    var proot = popHost.attachShadow({ mode: "open" });
    proot.innerHTML = "<style>" + POP_CSS + "</style>" + POP_HTML;
    document.body.appendChild(popHost);

    var pop = proot.querySelector(".pop");
    var monthsEl = proot.querySelector(".months");
    var prevBtn = proot.querySelector(".prev");
    var nextBtn = proot.querySelector(".next");
    var statusEl = proot.querySelector(".status");
    var applyBtn = proot.querySelector(".apply");

    var today = todayBerlin();
    var earliest = addDays(today, 1); // Anfragen ab morgen
    var minMonth = monthOf(earliest); // erster Monat mit anfragbaren Tagen
    var maxMonth = addMonths(minMonth, MAX_MONTHS_AHEAD);
    var latest = addDays(addMonths(maxMonth, 1) + "-01", -1);

    var committed = { start: null, end: null };
    var temp = { start: null, end: null };
    var hover = null;
    var view = minMonth;
    var focusDate = earliest;
    var shownCount = 0;

    function selectable(d) { return d >= earliest && d <= latest; }
    function count() { return isTwo() ? 2 : 1; }

    function buildMonth(m) {
      var wrap = el("div", "month");
      var p = m.split("-");
      var title = el("div", "title");
      title.id = "title-" + m;
      var strong = el("strong");
      strong.textContent = MONTHS[+p[1] - 1];
      title.appendChild(strong);
      title.appendChild(document.createTextNode(" " + p[0]));
      wrap.appendChild(title);
      var table = el("table");
      table.setAttribute("role", "grid");
      table.setAttribute("aria-labelledby", title.id);
      var thead = el("thead"), hr = el("tr");
      for (var w = 0; w < 7; w++) {
        var th = el("th");
        th.setAttribute("scope", "col");
        th.setAttribute("abbr", WD_LONG[w]);
        th.textContent = WD_SHORT[w];
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el("tbody"), tr = el("tr");
      var offset = weekday(m + "-01"), total = daysInMonth(m);
      for (var i = 0; i < offset; i++) tr.appendChild(el("td"));
      for (var d = 1; d <= total; d++) {
        var td = el("td");
        td.setAttribute("role", "gridcell");
        var b = el("button", "day");
        b.type = "button";
        b.setAttribute("data-date", m + "-" + pad(d));
        var span = el("span");
        span.setAttribute("aria-hidden", "true");
        span.textContent = String(d);
        b.appendChild(span);
        td.appendChild(b);
        tr.appendChild(td);
        if (tr.children.length === 7) { tbody.appendChild(tr); tr = el("tr"); }
      }
      if (tr.children.length) {
        while (tr.children.length < 7) tr.appendChild(el("td"));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      return wrap;
    }

    function build() {
      var c = count();
      if (view < minMonth) view = minMonth;
      if (addMonths(view, c - 1) > maxMonth) view = addMonths(maxMonth, -(c - 1));
      shownCount = c;
      pop.classList.toggle("two", c === 2);
      monthsEl.textContent = "";
      for (var i = 0; i < c; i++) monthsEl.appendChild(buildMonth(addMonths(view, i)));
      prevBtn.disabled = view <= minMonth;
      nextBtn.disabled = addMonths(view, c - 1) >= maxMonth;
      if (!monthsEl.querySelector('[data-date="' + focusDate + '"]')) {
        var all = monthsEl.querySelectorAll(".day"), first = null;
        for (var j = 0; j < all.length; j++) {
          if (selectable(all[j].getAttribute("data-date"))) { first = all[j].getAttribute("data-date"); break; }
        }
        focusDate = first || all[0].getAttribute("data-date");
      }
      paint();
    }

    function paint() {
      var s = temp.start, e = temp.end;
      var previewEnd = s && !e && hover && hover > s ? hover : null;
      var rangeEnd = e || previewEnd;
      var hasRange = !!(s && rangeEnd && rangeEnd !== s);
      var days = monthsEl.querySelectorAll(".day");
      for (var i = 0; i < days.length; i++) {
        var b = days[i], d = b.getAttribute("data-date");
        var dis = !selectable(d);
        var isStart = d === s;
        var isEnd = !!rangeEnd && d === rangeEnd;
        var inRange = hasRange && d > s && d < rangeEnd;
        b.classList.toggle("today", d === today);
        b.classList.toggle("start", isStart);
        b.classList.toggle("end", isEnd);
        b.classList.toggle("range", inRange);
        b.classList.toggle("has-range", hasRange && (isStart || isEnd));
        b.classList.toggle("preview", !!previewEnd && (isStart || inRange || isEnd));
        if (dis) b.setAttribute("aria-disabled", "true");
        else b.removeAttribute("aria-disabled");
        b.tabIndex = d === focusDate ? 0 : -1;
        var label = longLabel(d);
        if (d === today) label += ", heute";
        if (dis) label += ", nicht wählbar";
        if (isStart) label += e && e !== s ? ", Beginn" : ", ausgewählt";
        if (e && d === e && e !== s) label += ", Ende";
        b.setAttribute("aria-label", label);
        var selected = isStart || (!!e && (d === e || (d > s && d < e)));
        b.parentNode.setAttribute("aria-selected", selected ? "true" : "false");
      }
      if (!s) statusEl.textContent = "";
      else if (!e) statusEl.textContent = "Beginn " + fmt(s) + " – wähle das Ende oder übernimm diesen Tag.";
      else {
        var c = countDays(s, e);
        statusEl.textContent = fmtRange(s, e) + " · " + c + (c === 1 ? " Tag" : " Tage");
      }
      applyBtn.disabled = !s;
    }

    function place(allowScroll) {
      var vw = document.documentElement.clientWidth || window.innerWidth;
      var vh = window.innerHeight;
      var w = Math.min(shownCount === 2 ? 720 : 380, vw - 16);
      pop.style.width = w + "px";
      pop.style.maxHeight = "";
      pop.style.overflowY = "";
      var h = pop.offsetHeight;
      var r = dateBtn.getBoundingClientRect();
      if (allowScroll && h > vh - r.bottom - 16 && h > r.top - 16 - HEADER_OFFSET) {
        var need = h - (vh - r.bottom - 16);
        var room = r.top - HEADER_OFFSET;
        if (room > 0) {
          scrollByY(dateBtn, Math.min(need, room));
          r = dateBtn.getBoundingClientRect();
        }
      }
      var below = vh - r.bottom - 16, above = r.top - 16, top;
      if (h <= below) top = r.bottom + 8;
      else if (h <= above - HEADER_OFFSET) top = r.top - 8 - h;
      else {
        top = r.bottom + 8;
        pop.style.maxHeight = Math.max(below, 160) + "px";
        pop.style.overflowY = "auto";
      }
      var left = Math.max(8, Math.min(r.left, vw - 8 - w));
      pop.style.left = Math.round(left) + "px";
      pop.style.top = Math.round(top) + "px";
    }

    function focusDay(d) {
      var b = monthsEl.querySelector('[data-date="' + d + '"]');
      if (b) b.focus();
    }

    function open() {
      if (openInstance && openInstance !== api) openInstance.close(false);
      temp = { start: committed.start, end: committed.end };
      hover = null;
      focusDate = temp.start || earliest;
      view = monthOf(temp.start || earliest);
      syncFont();
      pop.hidden = false;
      openInstance = api;
      dateBtn.setAttribute("aria-expanded", "true");
      build();
      place(true);
      focusDay(focusDate);
    }
    function close(returnFocus) {
      if (openInstance !== api) return;
      pop.hidden = true;
      openInstance = null;
      hover = null;
      dateBtn.setAttribute("aria-expanded", "false");
      if (returnFocus) dateBtn.focus();
    }
    function apply() {
      if (!temp.start) return;
      committed = { start: temp.start, end: temp.end || temp.start };
      var text = fmtRange(committed.start, committed.end);
      dateValue.textContent = text;
      dateBtn.setAttribute("data-filled", "");
      dateBtn.setAttribute("aria-label", "Datum oder Zeitraum: " + text);
      clearError(dateBtn, dateErr);
      close(true);
    }
    function choose(d) {
      if (!temp.start || temp.end || d < temp.start) {
        temp.start = d;
        temp.end = null;
      } else {
        temp.end = d; // derselbe Tag ist als Beginn und Ende erlaubt
      }
      hover = null;
      focusDate = d;
      paint();
    }
    function moveFocus(t) {
      if (monthOf(t) < minMonth || monthOf(t) > maxMonth) return;
      focusDate = t;
      var c = count();
      if (monthOf(t) < view) { view = monthOf(t); build(); place(false); }
      else if (monthOf(t) > addMonths(view, c - 1)) { view = addMonths(monthOf(t), -(c - 1)); build(); place(false); }
      else paint();
      focusDay(t);
    }

    dateBtn.addEventListener("click", function () {
      if (openInstance === api) close(false);
      else open();
    });
    prevBtn.addEventListener("click", function () { view = addMonths(view, -1); build(); place(false); });
    nextBtn.addEventListener("click", function () { view = addMonths(view, 1); build(); place(false); });
    applyBtn.addEventListener("click", apply);
    monthsEl.addEventListener("click", function (e) {
      var b = closestDay(e.target);
      if (!b || b.getAttribute("aria-disabled") === "true") return;
      choose(b.getAttribute("data-date"));
    });
    monthsEl.addEventListener("mouseover", function (e) {
      var b = closestDay(e.target);
      var d = b && !b.getAttribute("aria-disabled") ? b.getAttribute("data-date") : null;
      if (temp.start && !temp.end && d !== hover) { hover = d; paint(); }
    });
    monthsEl.addEventListener("mouseleave", function () { if (hover) { hover = null; paint(); } });
    monthsEl.addEventListener("focusin", function (e) {
      var b = closestDay(e.target);
      if (b && temp.start && !temp.end) { hover = b.getAttribute("data-date"); paint(); }
    });
    monthsEl.addEventListener("keydown", function (e) {
      var b = closestDay(e.target);
      if (!b) return;
      var d = b.getAttribute("data-date"), t = null;
      switch (e.key) {
        case "ArrowLeft": t = addDays(d, -1); break;
        case "ArrowRight": t = addDays(d, 1); break;
        case "ArrowUp": t = addDays(d, -7); break;
        case "ArrowDown": t = addDays(d, 7); break;
        case "Home": t = addDays(d, -weekday(d)); break;
        case "End": t = addDays(d, 6 - weekday(d)); break;
        case "PageUp":
        case "PageDown": {
          var m = addMonths(monthOf(d), e.key === "PageUp" ? -1 : 1);
          t = m + "-" + pad(Math.min(parts(d)[2], daysInMonth(m)));
          break;
        }
        default: return;
      }
      e.preventDefault();
      moveFocus(t);
    });
    var escHandled = false;
    function swallowEscUp(e) {
      if ((e.key === "Escape" || e.key === "Esc") && escHandled) { escHandled = false; e.stopPropagation(); e.preventDefault(); }
    }
    pop.addEventListener("keyup", swallowEscUp);
    dateBtn.addEventListener("keyup", swallowEscUp);
    pop.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") { e.preventDefault(); e.stopPropagation(); escHandled = true; close(true); return; }
      if (e.key !== "Tab") return;
      var items = Array.prototype.filter.call(pop.querySelectorAll("button"), function (b) {
        return !b.disabled && b.tabIndex >= 0 && getComputedStyle(b).visibility !== "hidden";
      });
      if (!items.length) return;
      var active = proot.activeElement;
      if (!e.shiftKey && active === items[items.length - 1]) { e.preventDefault(); close(false); guestsEl.focus(); }
      else if (e.shiftKey && active === items[0]) { e.preventDefault(); close(true); }
    });
    dateBtn.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && openInstance === api) { e.preventDefault(); e.stopPropagation(); escHandled = true; close(false); }
    });

    function setError(field, out, msg) { field.setAttribute("aria-invalid", "true"); out.textContent = msg; }
    function clearError(field, out) { field.removeAttribute("aria-invalid"); out.textContent = ""; }

    guestsEl.addEventListener("input", function () {
      var v = guestsEl.value.replace(/[^\d]/g, "").slice(0, 4);
      if (v !== guestsEl.value) guestsEl.value = v;
      clearError(guestsEl, guestsErr);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      close(false);
      clearError(dateBtn, dateErr);
      clearError(guestsEl, guestsErr);
      var first = null;
      if (!committed.start) {
        setError(dateBtn, dateErr, "Bitte wähle einen Tag oder einen Zeitraum.");
        first = dateBtn;
      } else if (committed.start < earliest || committed.end > latest) {
        setError(dateBtn, dateErr, "Bitte wähle einen Termin ab " + fmt(earliest) + ".");
        first = dateBtn;
      }
      var g = guestsEl.value.trim();
      if (!g) {
        setError(guestsEl, guestsErr, "Bitte gib die Personenzahl an.");
        first = first || guestsEl;
      } else if (!/^\d{1,4}$/.test(g) || Number(g) < 1) {
        setError(guestsEl, guestsErr, "Bitte gib eine ganze Zahl ab 1 an.");
        first = first || guestsEl;
      }
      if (first) { first.focus(); return; }

      var url = new URL(TARGET_URL, window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("beginn", committed.start);
      if (committed.end && committed.end !== committed.start) url.searchParams.set("ende", committed.end);
      url.searchParams.set("personen", String(Number(g)));
      window.location.assign(url.toString());
    });

    var api = {
      form: form,
      contains: function (path) { return path.indexOf(pop) >= 0 || path.indexOf(dateBtn) >= 0; },
      close: close,
      reposition: function () {
        var r = dateBtn.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight || (!r.width && !r.height)) { close(false); return; }
        if (count() !== shownCount) build();
        place(false);
      },
      destroy: function () {
        close(false);
        if (popHost.parentNode) popHost.parentNode.removeChild(popHost);
      }
    };
    return api;
  }

  /* ---- Gemeinsame Ereignisse (einmal pro Seite) ---- */
  function setModality(m) {
    if (m === modality) return;
    modality = m;
    for (var i = 0; i < instances.length; i++) instances[i].form.setAttribute("data-sa-modality", m);
  }
  document.addEventListener("pointerdown", function (e) {
    setModality("pointer");
    if (!openInstance) return;
    var path = e.composedPath ? e.composedPath() : [e.target];
    if (!openInstance.contains(path)) openInstance.close(false);
  }, true);
  document.addEventListener("keydown", function (e) {
    var k = e.key || "";
    if (k === "Tab" || k.indexOf("Arrow") === 0) setModality("keyboard");
  }, true);
  window.addEventListener("scroll", function () { if (openInstance) openInstance.reposition(); }, true);
  window.addEventListener("resize", function () { if (openInstance) openInstance.reposition(); });

  /* ---- Initialisierung, auch für später eingefügte Inhalte ---- */
  // Markierung am Element selbst (eine Kopie des HTML wird so neu eingerichtet).
  var KEY = "__spaceAnfrageKalender";

  function scan() {
    // Leisten, die länger als 3 s nicht mehr im Dokument sind, aufräumen.
    // Kurzes Verschieben (z. B. Elementor-Popup öffnet) zählt nicht als Entfernen.
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      if (!inst.form.isConnected && !inst.pendingRemoval) {
        inst.pendingRemoval = true;
        setTimeout((function (it) {
          return function () {
            it.pendingRemoval = false;
            if (it.form.isConnected) return;
            it.destroy();
            it.form[KEY] = null;
            var k = instances.indexOf(it);
            if (k >= 0) instances.splice(k, 1);
          };
        })(inst), 3000);
      }
    }
    if (!document.body) return;
    var forms = document.querySelectorAll(SELECTOR);
    for (var j = 0; j < forms.length; j++) {
      var f = forms[j];
      if (f[KEY]) continue;
      try {
        var created = createInstance(f);
        f[KEY] = created;
        f.setAttribute("data-sa-ready", VERSION);
        f.setAttribute("data-sa-modality", modality);
        instances.push(created);
      } catch (err) {
        // Leiste bleibt sichtbar; ohne Kalender sendet der Pfeil das Formular normal ab.
        f[KEY] = { failed: true };
        f.setAttribute("data-sa-ready", "fehler");
        if (window.console) console.error("[SPACE-Anfrageleiste]", err);
      }
    }
  }

  var pending = false;
  function scheduleScan() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(function () { pending = false; scan(); });
  }

  window.SpaceAnfrageKalender = { version: VERSION, scan: scan, count: function () { return instances.length; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  scan();
  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes.length || records[i].removedNodes.length) { scheduleScan(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
