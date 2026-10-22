/* ============================================================
   羽 · 半日闲 — 交互脚本
   纯原生 JS，无依赖。数据存 localStorage。
   ============================================================ */
(function () {
  "use strict";

  /* ---------- 0. 常量与状态 ---------- */
  var STORE = "yu_site_v1";
  var CAT = {
    work:  { label: "工作", cls: "" },
    life:  { label: "生活", cls: "life" },
    study: { label: "学习", cls: "study" },
    other: { label: "其他", cls: "other" }
  };
  var WEEK1 = ["日", "一", "二", "三", "四", "五", "六"];
  var WEEK3 = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  var DB = {
    events: [],
    habits: [],
    notes: [],
    focusLog: {},
    settings: { theme: "light", fog: "normal", grain: "on", fireflies: "on", enter: "auto" }
  };

  var ui = { editingId: null, focusMin: 25, focusLeft: 25 * 60, focusEndAt: 0, focusRunning: false, focusStarted: false };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 1. 工具 ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dayDiff(dateStr) {
    return Math.round((midnight(new Date(dateStr + "T00:00:00")) - midnight(new Date())) / 86400000);
  }
  function tsOf(ev) { return new Date(ev.date + "T" + (ev.time || "00:00") + ":00").getTime(); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function relText(ts) {
    var diff = ts - Date.now();
    var m = Math.round(Math.abs(diff) / 60000);
    var s;
    if (m < 1) s = "不到 1 分钟";
    else if (m < 60) s = m + " 分钟";
    else if (m < 1440) {
      var h = Math.floor(m / 60), mm = m % 60;
      s = h + " 小时" + (mm ? " " + mm + " 分" : "");
    } else s = Math.floor(m / 1440) + " 天";
    return diff >= 0 ? s + "后" : "已过 " + s;
  }
  function shortDate(dateStr) {
    var d = dayDiff(dateStr);
    if (d === 0) return "今天";
    if (d === 1) return "明天";
    if (d === 2) return "后天";
    if (d === -1) return "昨天";
    var dt = new Date(dateStr + "T00:00:00");
    return (dt.getMonth() + 1) + "/" + dt.getDate() + " " + WEEK3[dt.getDay()];
  }
  function remindText(min) {
    min = Number(min) || 0;
    if (min === 0) return "准时";
    if (min < 60) return "提前 " + min + " 分";
    if (min < 1440) return "提前 " + (min / 60) + " 小时";
    return "提前 1 天";
  }

  /* ---------- 2. 存储 ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var d = JSON.parse(raw);
      Object.keys(DB).forEach(function (k) {
        if (k === "settings") {
          if (d.settings) Object.keys(DB.settings).forEach(function (s) {
            if (d.settings[s] != null) DB.settings[s] = d.settings[s];
          });
        } else if (d[k] != null) {
          DB[k] = d[k];
        }
      });
    } catch (e) { console.warn("读取本地数据失败", e); }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(DB)); }
    catch (e) { toast("存不下了", "浏览器存储已满，建议先导出备份", { kind: "warn" }); }
  }

  /* ---------- 3. 声音与浮窗 ---------- */
  var ac = null;
  function chime(times) {
    times = times || 1;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ac) ac = new AC();
      if (ac.state === "suspended") ac.resume();
      for (var i = 0; i < times; i++) {
        (function (i) {
          setTimeout(function () {
            var t0 = ac.currentTime;
            [0, 0.16].forEach(function (off, k) {
              var o = ac.createOscillator(), g = ac.createGain();
              o.type = "sine";
              o.frequency.setValueAtTime(k === 0 ? 784 : 1046, t0 + off);
              g.gain.setValueAtTime(0.0001, t0 + off);
              g.gain.exponentialRampToValueAtTime(0.16, t0 + off + 0.02);
              g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.5);
              o.connect(g); g.connect(ac.destination);
              o.start(t0 + off); o.stop(t0 + off + 0.52);
            });
          }, i * 620);
        })(i);
      }
    } catch (e) { /* 静默 */ }
  }

  function toast(title, desc, opts) {
    opts = opts || {};
    var wrap = $("#toast-wrap");
    var el = document.createElement("div");
    el.className = "toast" + (opts.kind === "warn" ? " warn" : "");
    el.innerHTML =
      '<div class="tt">' + esc(title) + "</div>" +
      (desc ? '<div class="td">' + esc(desc) + "</div>" : "");
    if (opts.actionLabel) {
      var b = document.createElement("button");
      b.className = "linkbtn";
      b.style.marginTop = "8px";
      b.style.fontSize = "11px";
      b.textContent = opts.actionLabel;
      b.onclick = function () {
        if (opts.onAction) opts.onAction();
        el.remove();
      };
      el.appendChild(b);
    }
    wrap.appendChild(el);
    var life = opts.keep ? 10000 : 5200;
    setTimeout(function () {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(function () { el.remove(); }, 320);
    }, life);
  }

  /* ---------- 4. 通知 ---------- */
  function canNotify() { return "Notification" in window; }
  function notifyUI() {
    var btn = $("#hero-notify");
    var hint = $("#notify-hint");
    if (!canNotify()) {
      btn.textContent = "notify — 浏览器不支持";
      hint.textContent = "这个浏览器不支持桌面通知，到点会用页面内浮窗提醒你。";
      return;
    }
    var p = Notification.permission;
    if (p === "granted") {
      btn.textContent = "notify — 已开启";
      hint.textContent = "桌面通知已开启，保持页面在后台即可收到提醒。";
    } else if (p === "denied") {
      btn.textContent = "notify — 被拦截了";
      hint.textContent = "请在地址栏左侧的站点设置里把「通知」改为允许，再刷新页面。";
    } else {
      btn.textContent = "notify — 开启提醒";
      hint.textContent = "提醒会在到点前弹出系统通知。";
    }
  }
  function askNotify(silent) {
    if (!canNotify()) {
      if (!silent) toast("不支持通知", "换个浏览器，或用页面内浮窗", { kind: "warn" });
      return;
    }
    chime(1);
    Notification.requestPermission().then(function (p) {
      notifyUI();
      if (p === "granted") toast("提醒已开启", "到点我会叫你");
      else if (p === "denied") toast("通知被拒绝", "可以在站点设置里重新允许", { kind: "warn" });
    }).catch(function () { notifyUI(); });
  }

  function fire(ev) {
    var title = "⏰ " + (ev.title || "日程提醒");
    var body = (ev.time || "") + " · " + (CAT[ev.cat] ? CAT[ev.cat].label : "") +
               (ev.note ? " · " + ev.note : "");
    toast(title, body, { keep: true });
    if (canNotify() && Notification.permission === "granted") {
      try {
        var n = new Notification(title, { body: body, tag: "ev-" + ev.id, requireInteraction: true });
        n.onclick = function () { window.focus(); n.close(); };
      } catch (e) { /* ignore */ }
    }
    chime(2);
    var orig = document.title, i = 0;
    var t = setInterval(function () {
      document.title = (i % 2 === 0) ? "⏰ " + ev.title : orig;
      if (++i > 9) { clearInterval(t); document.title = orig; }
    }, 700);
  }

  function checkReminders() {
    var now = Date.now(), changed = false;
    DB.events.forEach(function (ev) {
      if (ev.done || ev.notified) return;
      var s = tsOf(ev), at = s - (Number(ev.remind) || 0) * 60000;
      if (now >= at && now <= s + 2 * 3600000) {
        ev.notified = true; changed = true; fire(ev);
      } else if (now > s + 2 * 3600000) {
        ev.notified = true; changed = true;
      }
    });
    if (changed) save();
  }

  /* ---------- 5. 主题 / 显示设置 ---------- */
  function applySettings() {
    var s = DB.settings;
    var html = document.documentElement;
    html.setAttribute("data-theme", s.theme);
    html.setAttribute("data-fog", s.fog);
    html.setAttribute("data-grain", s.grain);
    html.setAttribute("data-fireflies", s.fireflies);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", s.theme === "night" ? "#0A1626" : "#EFF5FC");
    $("#icon-sun").style.display = s.theme === "night" ? "none" : "";
    $("#icon-moon").style.display = s.theme === "night" ? "" : "none";
    $$('input[name="fog"]').forEach(function (i) { i.checked = i.value === s.fog; });
    $$('input[name="grain"]').forEach(function (i) { i.checked = i.value === s.grain; });
    $$('input[name="fireflies"]').forEach(function (i) { i.checked = i.value === s.fireflies; });
    $$('input[name="enter"]').forEach(function (i) { i.checked = i.value === s.enter; });
  }

  function buildFireflies() {
    var box = $("#fireflies");
    box.innerHTML = "";
    for (var i = 0; i < 14; i++) {
      var f = document.createElement("span");
      f.className = "firefly";
      f.style.left = (2 + Math.random() * 94) + "%";
      f.style.top = "0";
      f.style.animationDelay = (-Math.random() * 20) + "s, " + (-Math.random() * 3.6) + "s";
      f.style.animationDuration = (13 + Math.random() * 9) + "s, " + (2.8 + Math.random() * 2.4) + "s";
      f.style.opacity = "";
      box.appendChild(f);
    }
  }

  /* ---------- 6. 时钟 / 日环 / 此刻的话 ---------- */
  var WATCH = [
    { h: [0, 5],  w: "深夜", line: "还醒着的话，先去睡，明天会自己来。" },
    { h: [5, 8],  w: "晨雾", line: "雾还没散，先把今天最重要的那一件挑出来。" },
    { h: [8, 11], w: "上午", line: "上午的光最干净，留给最难的那件事。" },
    { h: [11, 14],w: "正午", line: "吃过饭再想事情，别在饿的时候决定什么。" },
    { h: [14, 17],w: "午后", line: "困了就站起来走一圈，别和自己的身体较劲。" },
    { h: [17, 20],w: "暮色", line: "天要暗了，收一收手上没做完的活。" },
    { h: [20, 24],w: "夜雾", line: "今天剩下的时间，只够做一件小事了。" }
  ];
  function tickClock() {
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    $("#clock").textContent = pad(hh) + ":" + pad(mm);
    var p = (hh * 60 + mm) / 1440;
    var ring = $("#day-ring");
    if (ring) ring.style.strokeDashoffset = String(43.98 * (1 - p));
    var cur = WATCH.filter(function (x) { return hh >= x.h[0] && hh < x.h[1]; })[0] || WATCH[0];
    var w = $("#weather-word");
    if (w) w.textContent = cur.w;
    var watch = $("#hero-watch");
    if (watch && !watch.dataset.filled) {
      watch.textContent = cur.line;
      watch.hidden = false;
      watch.dataset.filled = "1";
    }
  }

  /* ---------- 7. 日程 ---------- */
  function renderAgenda() {
    var box = $("#agenda-list");
    var now = Date.now();
    var undone = DB.events.filter(function (e) { return !e.done; })
      .sort(function (a, b) { return tsOf(a) - tsOf(b); });
    var done = DB.events.filter(function (e) { return e.done; })
      .sort(function (a, b) { return tsOf(b) - tsOf(a); }).slice(0, 6);

    var todayN = undone.filter(function (e) { return dayDiff(e.date) === 0; }).length;
    $("#sec-count").textContent = pad(undone.length);
    $("#log-today").textContent = pad(todayN);

    if (!undone.length && !done.length) {
      box.innerHTML = '<li class="empty-state">还没有安排。' +
        '<span>nothing yet</span></li>';
      return;
    }

    var html = "", n = 0;
    undone.forEach(function (ev) {
      n++;
      var s = tsOf(ev), cat = CAT[ev.cat] || CAT.other;
      var over = s < now, soon = !over && s - now < 3600000;
      var tags = '<span class="tag ' + cat.cls + '">' + cat.label + "</span>";
      if (over) tags += '<span class="tag over">逾期</span>';
      else if (soon) tags += '<span class="tag soon">即将</span>';
      html +=
        '<li class="agenda-item" data-id="' + ev.id + '">' +
          '<span class="folio">' + pad(n) + "</span>" +
          '<div class="ai-main">' +
            '<h3 class="ai-title">' + esc(ev.title) + tags + "</h3>" +
            (ev.note ? '<p class="ai-ex">' + esc(ev.note) + "</p>" : "") +
          "</div>" +
          '<div class="ai-side">' +
            "<time>" + esc(ev.time) + "</time>" +
            '<span class="ai-sub">' +
              (over ? relText(s) : shortDate(ev.date) + " · " + relText(s)) +
            "</span>" +
            '<span class="ai-sub">' + esc(remindText(ev.remind)) + "</span>" +
          "</div>" +
          '<div class="ai-acts">' +
            '<button class="mini-btn" data-act="done" title="完成">✓</button>' +
            '<button class="mini-btn" data-act="edit" title="编辑">✎</button>' +
            '<button class="mini-btn del" data-act="del" title="删除">✕</button>' +
          "</div>" +
        "</li>";
    });

    done.forEach(function (ev) {
      html +=
        '<li class="agenda-item done" data-id="' + ev.id + '">' +
          '<span class="folio">··</span>' +
          '<div class="ai-main"><h3 class="ai-title">' + esc(ev.title) + "</h3></div>" +
          '<div class="ai-side"><time>' + esc(ev.time) + "</time>" +
            '<span class="ai-sub">' + esc(shortDate(ev.date)) + "</span></div>" +
          '<div class="ai-acts">' +
            '<button class="mini-btn" data-act="done" title="撤销完成">↺</button>' +
            '<button class="mini-btn del" data-act="del" title="删除">✕</button>' +
          "</div>" +
        "</li>";
    });
    box.innerHTML = html;
  }

  function resetForm() {
    ui.editingId = null;
    $("#f-title").value = "";
    $("#f-note").value = "";
    $("#f-date").value = today();
    $("#f-time").value = "09:00";
    $("#f-remind").value = "10";
    $("#f-cat").value = "work";
    $("#btn-save").textContent = "收下";
    $("#btn-cancel").hidden = true;
  }

  $("#event-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("#f-title").value.trim();
    var d = $("#f-date").value, tm = $("#f-time").value;
    if (!t || !d || !tm) { toast("还差一点", "名称、日期、时间都要有", { kind: "warn" }); return; }
    var payload = {
      title: t, date: d, time: tm,
      remind: Number($("#f-remind").value) || 0,
      cat: $("#f-cat").value,
      note: $("#f-note").value.trim()
    };
    if (ui.editingId) {
      var ev = DB.events.filter(function (x) { return x.id === ui.editingId; })[0];
      if (ev) {
        Object.keys(payload).forEach(function (k) { ev[k] = payload[k]; });
        ev.notified = false;
        toast("改好了", payload.title);
      }
    } else {
      payload.id = String(Date.now()) + Math.random().toString(16).slice(2, 6);
      payload.done = false;
      payload.notified = false;
      DB.events.push(payload);
      toast("记下了", shortDate(d) + " " + tm + " · " + t);
      if (canNotify() && Notification.permission === "default") askNotify(true);
    }
    save(); resetForm(); renderAgenda(); renderStats(); checkReminders();
  });

  $("#btn-cancel").addEventListener("click", resetForm);

  $("#agenda-list").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var li = btn.closest(".agenda-item");
    if (!li) return;
    var id = li.dataset.id;
    var idx = DB.events.findIndex(function (x) { return x.id === id; });
    if (idx < 0) return;
    var ev = DB.events[idx];
    var act = btn.dataset.act;

    if (act === "done") {
      ev.done = !ev.done;
      save(); renderAgenda();
    } else if (act === "del") {
      DB.events.splice(idx, 1);
      save(); renderAgenda(); renderStats();
      toast("删掉了", ev.title, {
        actionLabel: "撤销",
        onAction: function () {
          DB.events.push(ev); save(); renderAgenda(); renderStats();
          toast("回来了", ev.title);
        }
      });
    } else if (act === "edit") {
      ui.editingId = id;
      $("#f-title").value = ev.title;
      $("#f-date").value = ev.date;
      $("#f-time").value = ev.time;
      $("#f-remind").value = String(ev.remind);
      $("#f-cat").value = ev.cat;
      $("#f-note").value = ev.note || "";
      $("#btn-save").textContent = "保存";
      $("#btn-cancel").hidden = false;
      $("#f-title").focus();
      $("#agenda").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  /* ---------- 8. 专注 ---------- */
  var RING_C = 2 * Math.PI * 98;

  function focusRender() {
    var m = Math.floor(ui.focusLeft / 60), s = ui.focusLeft % 60;
    $("#focus-time").textContent = pad(m) + ":" + pad(s);
    var total = ui.focusMin * 60;
    var p = total ? ui.focusLeft / total : 0;
    $("#ring-fill").style.strokeDasharray = RING_C;
    $("#ring-fill").style.strokeDashoffset = String(RING_C * (1 - p));
    $("#focus-start").textContent = ui.focusRunning ? "暂停" : (ui.focusStarted ? "继续" : "开始");
    $("#focus-cap").textContent = ui.focusRunning
      ? "专注中 · " + ui.focusMin + " 分"
      : (ui.focusLeft === ui.focusMin * 60 ? "专注 · 未开始" : "已暂停");
    $$(".chip").forEach(function (c) {
      c.classList.toggle("active", Number(c.dataset.min) === ui.focusMin);
    });
    var t = DB.focusLog[today()] || 0;
    $("#focus-total").textContent = t;
    $("#log-focus").textContent = pad(t);
  }

  function focusTick() {
    if (!ui.focusRunning) return;
    var left = Math.max(0, Math.round((ui.focusEndAt - Date.now()) / 1000));
    ui.focusLeft = left;
    if (left <= 0) {
      ui.focusRunning = false;
      ui.focusStarted = false;
      DB.focusLog[today()] = (DB.focusLog[today()] || 0) + ui.focusMin;
      save();
      chime(3);
      toast("专注结束", ui.focusMin + " 分钟，起来动一下", { keep: true });
      if (canNotify() && Notification.permission === "granted") {
        try { new Notification("专注结束", { body: ui.focusMin + " 分钟结束了，休息一下。" }); } catch (err) {}
      }
      $("#focus-note").textContent = "完成了 " + ui.focusMin + " 分钟。喝口水，看看窗外。";
    }
    focusRender();
  }

  $("#focus-start").addEventListener("click", function () {
    if (ui.focusRunning) {
      ui.focusRunning = false;
      ui.focusLeft = Math.max(0, Math.round((ui.focusEndAt - Date.now()) / 1000));
    } else {
      if (ui.focusLeft <= 0) ui.focusLeft = ui.focusMin * 60;
      ui.focusEndAt = Date.now() + ui.focusLeft * 1000;
      ui.focusRunning = true;
      ui.focusStarted = true;
      $("#focus-note").textContent = "开始 " + ui.focusMin + " 分钟。手机反过来，浏览器关掉别的标签。";
      chime(1);
    }
    focusRender();
  });

  $("#focus-reset").addEventListener("click", function () {
    ui.focusRunning = false;
    ui.focusStarted = false;
    ui.focusLeft = ui.focusMin * 60;
    $("#focus-note").textContent = "选一段时间，把手机反过来放。";
    focusRender();
  });

  $$(".chip").forEach(function (c) {
    c.addEventListener("click", function () {
      ui.focusMin = Number(c.dataset.min);
      ui.focusRunning = false;
      ui.focusStarted = false;
      ui.focusLeft = ui.focusMin * 60;
      focusRender();
    });
  });

  /* ---------- 9. 打卡 ---------- */
  function last7() {
    var out = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      out.push(ymd(d));
    }
    return out;
  }
  function streak(h) {
    var n = 0, d = new Date();
    // 今天没打卡也算连续（从昨天往前数）
    if (!h.days[today()]) d.setDate(d.getDate() - 1);
    while (h.days[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function renderHabits() {
    var box = $("#ritual-list");
    if (!DB.habits.length) {
      box.innerHTML = '<div class="empty-state">还没有想坚持的小事。<span>no ritual yet</span></div>';
      $("#log-ritual").textContent = "00";
      return;
    }
    var days = last7(), td = today();
    var html = "";
    DB.habits.forEach(function (h) {
      var dots = days.map(function (d) {
        var dt = new Date(d + "T00:00:00");
        var on = !!h.days[d];
        var isToday = d === td;
        return '<div class="day' + (on ? " on" : "") + (isToday ? " today" : "") +
          '" data-date="' + d + '" data-habit="' + h.id + '" title="' + d + '">' +
          '<i></i><span>' + (isToday ? "今" : WEEK1[dt.getDay()]) + "</span></div>";
      }).join("");
      html +=
        '<div class="habit" data-habit="' + h.id + '">' +
          '<div class="habit-name">' + esc(h.name) +
            '<span class="habit-streak">连续 <b>' + streak(h) + "</b> 天</span>" +
          "</div>" +
          '<div class="dots">' + dots + "</div>" +
          '<button class="habit-del" data-act="del-habit" title="删除">✕</button>' +
        "</div>";
    });
    box.innerHTML = html;
    var maxStreak = Math.max.apply(null, DB.habits.map(streak).concat([0]));
    $("#log-ritual").textContent = pad(maxStreak);
  }

  $("#ritual-list").addEventListener("click", function (e) {
    var del = e.target.closest('[data-act="del-habit"]');
    if (del) {
      var id = del.closest(".habit").dataset.habit;
      var h = DB.habits.filter(function (x) { return x.id === id; })[0];
      DB.habits = DB.habits.filter(function (x) { return x.id !== id; });
      save(); renderHabits();
      toast("删掉了", h ? h.name : "");
      return;
    }
    var day = e.target.closest(".day");
    if (!day) return;
    var hid = day.dataset.habit, date = day.dataset.date;
    var habit = DB.habits.filter(function (x) { return x.id === hid; })[0];
    if (!habit) return;
    if (habit.days[date]) delete habit.days[date];
    else habit.days[date] = true;
    save(); renderHabits();
  });

  $("#habit-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("#f-habit").value.trim();
    if (!v) return;
    DB.habits.push({ id: "h" + Date.now(), name: v, days: {} });
    $("#f-habit").value = "";
    save(); renderHabits();
    toast("加上了", v);
  });

  /* ---------- 10. 随记 ---------- */
  function renderNotes() {
    var box = $("#notes-list");
    $("#note-count").textContent = pad(DB.notes.length);
    if (!DB.notes.length) {
      box.innerHTML = '<div class="empty-state">还没有句子。<span>write one below</span></div>';
      return;
    }
    box.innerHTML = DB.notes.slice(0, 8).map(function (n) {
      var d = new Date(n.ts);
      return '<div class="note" data-id="' + n.id + '">' +
        "<time>" + d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()) + "</time>" +
        "<p>" + esc(n.text) + "</p>" +
        '<button class="habit-del" data-act="del-note" title="删除">✕</button>' +
      "</div>";
    }).join("");
  }

  $("#note-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = $("#f-note-text").value.trim();
    if (!v) return;
    DB.notes.unshift({ id: "n" + Date.now(), text: v, ts: Date.now() });
    $("#f-note-text").value = "";
    save(); renderNotes();
  });

  $("#notes-list").addEventListener("click", function (e) {
    var btn = e.target.closest('[data-act="del-note"]');
    if (!btn) return;
    var id = btn.closest(".note").dataset.id;
    DB.notes = DB.notes.filter(function (x) { return x.id !== id; });
    save(); renderNotes();
  });

  /* ---------- 11. 统计 ---------- */
  function renderStats() {
    var undone = DB.events.filter(function (e) { return !e.done; });
    $("#log-today").textContent = pad(undone.filter(function (e) { return dayDiff(e.date) === 0; }).length);
    $("#log-focus").textContent = pad(DB.focusLog[today()] || 0);
  }

  /* ---------- 12. 导入导出 ---------- */
  $("#btn-export").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(DB, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "yu-backup-" + today() + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast("已导出", DB.events.length + " 条日程 · " + DB.notes.length + " 句随记");
  });

  $("#btn-import").addEventListener("click", function () { $("#file-input").click(); });

  $("#file-input").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        var added = 0;
        if (Array.isArray(d.events)) {
          var ids = {};
          DB.events.forEach(function (x) { ids[x.id] = 1; });
          d.events.forEach(function (ev) {
            if (!ev || !ev.title || !ev.date || ids[ev.id]) return;
            if (!ev.id) ev.id = String(Date.now()) + Math.random().toString(16).slice(2, 6);
            DB.events.push(ev); added++;
          });
        }
        if (Array.isArray(d.habits)) {
          var hids = {};
          DB.habits.forEach(function (x) { hids[x.id] = 1; });
          d.habits.forEach(function (h) {
            if (!h || !h.name || hids[h.id]) return;
            if (!h.id) h.id = "h" + Date.now() + Math.random().toString(16).slice(2, 5);
            if (!h.days) h.days = {};
            DB.habits.push(h); added++;
          });
        }
        if (Array.isArray(d.notes)) {
          var nids = {};
          DB.notes.forEach(function (x) { nids[x.id] = 1; });
          d.notes.forEach(function (n) {
            if (!n || !n.text || nids[n.id]) return;
            if (!n.id) n.id = "n" + Date.now() + Math.random().toString(16).slice(2, 5);
            if (!n.ts) n.ts = Date.now();
            DB.notes.push(n); added++;
          });
          DB.notes.sort(function (a, b) { return b.ts - a.ts; });
        }
        if (d.focusLog && typeof d.focusLog === "object") {
          Object.keys(d.focusLog).forEach(function (k) {
            DB.focusLog[k] = Math.max(DB.focusLog[k] || 0, Number(d.focusLog[k]) || 0);
          });
        }
        save(); renderAll();
        toast("导入完成", "新增 " + added + " 条");
      } catch (err) {
        toast("导入失败", "这不是有效的备份文件", { kind: "warn" });
      }
      e.target.value = "";
    };
    r.readAsText(f);
  });

  $("#btn-clear").addEventListener("click", function () {
    var n = DB.events.filter(function (e) { return e.done; }).length;
    if (!n) { toast("没有已完成", "不用清"); return; }
    DB.events = DB.events.filter(function (e) { return !e.done; });
    save(); renderAll();
    toast("清空了", n + " 条已完成记录");
  });

  /* ---------- 13. 导航与设置交互 ---------- */
  $("#theme-toggle").addEventListener("click", function () {
    DB.settings.theme = DB.settings.theme === "night" ? "light" : "night";
    applySettings(); save();
  });

  var settingsBtn = $("#settings-toggle"), settingsBox = $("#display-settings");
  settingsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = settingsBox.classList.toggle("open");
    settingsBtn.setAttribute("aria-expanded", String(open));
    if (open) settingsBox.removeAttribute("inert");
    else settingsBox.setAttribute("inert", "");
  });
  document.addEventListener("click", function (e) {
    if (!settingsBox.classList.contains("open")) return;
    if (settingsBox.contains(e.target) || settingsBtn.contains(e.target)) return;
    settingsBox.classList.remove("open");
    settingsBtn.setAttribute("aria-expanded", "false");
    settingsBox.setAttribute("inert", "");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && settingsBox.classList.contains("open")) {
      settingsBox.classList.remove("open");
      settingsBtn.setAttribute("aria-expanded", "false");
      settingsBox.setAttribute("inert", "");
    }
  });

  $$('#display-settings input[type="radio"]').forEach(function (input) {
    input.addEventListener("change", function () {
      DB.settings[input.name] = input.value;
      applySettings(); save();
      if (input.name === "fireflies") buildFireflies();
    });
  });

  $("#hero-notify").addEventListener("click", function () { askNotify(false); });

  // 导航当前区块高亮
  var sections = ["top", "agenda", "focus", "ritual", "notes"].map(function (id) {
    return document.getElementById(id);
  }).filter(Boolean);
  var navLinks = $$(".nav-links > a");

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        navLinks.forEach(function (a) {
          a.classList.toggle("here", a.getAttribute("href") === "#" + id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 14. 启动 ---------- */
  function renderAll() {
    renderAgenda(); renderHabits(); renderNotes(); renderStats(); focusRender();
  }

  load();
  applySettings();
  buildFireflies();

  // 会话内第二次进入：跳过入场动画
  try {
    if (DB.settings.enter === "auto" && sessionStorage.getItem("yu_entered")) {
      document.documentElement.setAttribute("data-enter", "skip");
    }
    sessionStorage.setItem("yu_entered", "1");
  } catch (e) {}

  resetForm();
  renderAll();
  notifyUI();
  tickClock();
  checkReminders();

  // 首次使用：放几条示例，让页面不空
  if (!DB.events.length && !DB.notes.length && !DB.habits.length && !localStorage.getItem(STORE)) {
    var now = new Date();
    var later = new Date(now.getTime() + 40 * 60000);
    later.setSeconds(0, 0);
    later.setMinutes(Math.ceil(later.getMinutes() / 5) * 5); // 60 会自动进位到下一小时
    var tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    DB.events.push({
      id: "seed1", title: "把这里换成你真正要做的事",
      date: ymd(later), time: pad(later.getHours()) + ":" + pad(later.getMinutes()),
      remind: 10, cat: "work", note: "点右边的 ✎ 可以改，✕ 可以删。",
      done: false, notified: false
    });
    DB.events.push({
      id: "seed2", title: "给自己留一段不被打扰的时间",
      date: ymd(tmr), time: "09:00", remind: 30, cat: "life",
      note: "", done: false, notified: false
    });
    var hd = {}; hd[today()] = true;
    DB.habits.push({ id: "seedh1", name: "读 10 页书", days: hd });
    DB.notes.unshift({ id: "seedn1", text: "雨后的人行道反着光，走路像在翻一本没裁开的书。", ts: Date.now() });
    save(); renderAll();
  }

  setInterval(function () {
    tickClock();
    checkReminders();
    focusTick();
  }, 1000);

  // 相对时间（「还有 2 小时」）每 30 秒刷新一次，别每秒重绘列表
  setInterval(function () {
    renderAgenda();
    renderStats();
  }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { checkReminders(); focusTick(); renderAgenda(); }
  });

  // PWA：离线可用（https / localhost 下才生效）
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 忽略 */ });
    });
  }
})();
