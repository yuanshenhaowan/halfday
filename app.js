/* ============================================================
   羽 · 半日闲 — 交互脚本
   纯原生 JS，无依赖。没有服务端、没有登录、没有数据库。
   线上站是 data/content.json 的一份静态快照；只有拿着发布凭证的人能重写它。
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
    settings: { theme: "light", fog: "normal", grain: "on", fireflies: "on", enter: "auto" }
  };

  var ui = { editingId: null };

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
    afterChange();
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
    var v = $("#f-note-text").value.trim();
    if (!v) return;
    DB.notes.unshift({ id: "n" + Date.now(), text: v, ts: Date.now() });
    $("#f-note-text").value = "";
    save(); renderNotes();
  });

  $("#notes-list").addEventListener("click", function (e) {
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
    if (!canEdit()) return;
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
  var sections = ["top", "agenda", "ritual", "notes"].map(function (id) {
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

  /* ---------- 14. 发布：仓库里那份快照是唯一真相 ---------- */
  /* 这一版的取舍：没有服务端、没有登录、没有数据库。
     线上站只是 data/content.json 的一份静态快照，访客拿到的就是它渲染出来的字节。
     唯一能重写这份快照的人，是手里有「发布凭证」的人 —— 一枚只对本站有写权限的
     GitHub token，存在他自己那台浏览器里。别的机器上没有那把钥匙，
     所以页面上任何一个写着「改」的地方，在他们那儿根本不存在。 */
  var REPO = { owner: "yuanshenhaowan", name: "halfday", branch: "main", path: "data/content.json" };
  var PAT_KEY = "yu_publish_pat";
  var API = "https://api.github.com";

  var ROLE = "visitor";
  var OWNER = { login: "", verified: false };
  var REMOTE = { publishedAt: null, sig: "", ready: false };
  var PUB = { busy: false, lastAt: 0 };

  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") {
      return "{" + Object.keys(v).sort().map(function (k) {
        return JSON.stringify(k) + ":" + canon(v[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  /* 签名只看内容，不看 notified 这种运行时留下的标记 ——
     否则提醒一响，「有改动没发布」就自己亮起来，那是个假信号。 */
  function sigOf(src) {
    return canon({
      events: (src.events || []).map(function (e) {
        var o = {};
        Object.keys(e).forEach(function (k) { if (k !== "notified") o[k] = e[k]; });
        return o;
      }),
      habits: src.habits || [],
      notes: src.notes || []
    });
  }
  function contentSig() { return sigOf(DB); }
  function isDirty() { return ROLE === "owner" && REMOTE.ready && contentSig() !== REMOTE.sig; }

  /* 一句判据管住所有写操作：这台设备上有凭证、而且验过了，才算主人 */
  function canEdit() { return ROLE === "owner"; }

  function payload() {
    return {
      v: 3,
      published_at: new Date().toISOString(),
      events: DB.events,
      habits: DB.habits,
      notes: DB.notes
    };
  }

  function adoptContent(d) {
    DB.events = Array.isArray(d.events) ? d.events.filter(function (e) { return e && e.title; }) : [];
    DB.habits = Array.isArray(d.habits) ? d.habits.filter(function (h) { return h && h.name; }) : [];
    DB.notes  = Array.isArray(d.notes)  ? d.notes.filter(function (n) { return n && n.text; })  : [];
  }

  function loadPublished() {
    return fetch("data/content.json?_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function (e) {
        console.warn("[content] 快照读不到", e && e.message);
        return null;
      });
  }

  /* --- 发布凭证 --- */
  function ghHeaders(pat) {
    return {
      Authorization: "Bearer " + pat,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  function getPat() { try { return localStorage.getItem(PAT_KEY) || ""; } catch (e) { return ""; } }
  function setPat(p) {
    try { if (p) localStorage.setItem(PAT_KEY, p); else localStorage.removeItem(PAT_KEY); } catch (e) {}
  }

  function verifyPat(pat) {
    return fetch(API + "/repos/" + REPO.owner + "/" + REPO.name, { headers: ghHeaders(pat) })
      .then(function (r) {
        if (r.status === 401) throw new Error("GitHub 不认这枚凭证：过期、撤销，或者抄漏了字符");
        if (r.status === 404) throw new Error("这枚凭证看不到 " + REPO.owner + "/" + REPO.name + "，检查它授权的仓库范围");
        if (!r.ok) throw new Error("GitHub 返回 " + r.status);
        return r.json();
      })
      .then(function (d) {
        var p = d.permissions || {};
        if (!p.push) throw new Error("这枚凭证只有读权限，Contents 要设成 Read and write");
        return d.full_name || (REPO.owner + "/" + REPO.name);
      });
  }

  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function publish() {
    var pat = getPat();
    if (!pat) { toast("没有发布凭证", "先点右上角的「羽」填一枚", { kind: "warn" }); return; }
    if (PUB.busy) return;
    PUB.busy = true;
    refreshOwnerUI();

    var url = API + "/repos/" + REPO.owner + "/" + REPO.name + "/contents/" + REPO.path;
    var text = JSON.stringify(payload(), null, 2) + "\n";

    fetch(url, { headers: ghHeaders(pat) })
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("读不到远端那份快照（" + r.status + "）");
        return r.json();
      })
      .then(function (cur) {
        var body = {
          message: "content: " + new Date().toLocaleString("zh-CN", { hour12: false }),
          content: b64utf8(text),
          branch: REPO.branch
        };
        if (cur && cur.sha) body.sha = cur.sha;
        return fetch(url, { method: "PUT", headers: ghHeaders(pat), body: JSON.stringify(body) });
      })
      .then(function (r) {
        if (r.status === 409) throw new Error("远端刚被另一个窗口改过，刷新页面再来一次");
        if (r.ok) return r.json();
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error((j && j.message) || ("写入失败（" + r.status + "）"));
        });
      })
      .then(function () {
        REMOTE.sig = contentSig();
        REMOTE.publishedAt = new Date().toISOString();
        PUB.lastAt = Date.now();
        toast("已发布", "仓库更新了，GitHub Pages 大约 30 秒后重建完");
      })
      .catch(function (e) {
        toast("发布失败", (e && e.message) || "换个网络再试", { kind: "warn" });
      })
      .then(function () {
        PUB.busy = false;
        refreshOwnerUI();
        stampUpdated();
      });
  }

  /* --- 角色与界面 --- */
  function setRole(r) {
    ROLE = r;
    document.body.classList.toggle("is-visitor", r === "visitor");
    document.body.classList.toggle("is-owner", r === "owner");
    var tag = $("#ro-tag"); if (tag) tag.hidden = r !== "visitor";
    var nb = $("#hero-notify"); if (nb) nb.hidden = r === "visitor";
    var ab = $("#auth-btn"); if (ab) ab.textContent = r === "owner" ? "羽" : "访客";
    var fn = $("#foot-note");
    if (fn) fn.textContent = r === "visitor"
      ? "以上内容由主人一人维护，访客只能看。"
      : "改动先落在这台机器上，点「发布」才会到线上。";
    renderAll();
    stampUpdated();
    refreshOwnerUI();
    renderOwnerPanel();
  }

  /* 每次 save() 之后叫一次：只有内容真的和线上那份不一样，「发布」才亮 */
  function afterChange() {
    if (!REMOTE.ready) return;
    refreshOwnerUI();
  }

  function refreshOwnerUI() {
    var bar = $("#pub-bar");
    if (!bar) return;
    bar.hidden = !PUB.busy && !isDirty();
    bar.classList.toggle("busy", PUB.busy);
    var t = $("#pubbar-t");
    if (t) {
      if (PUB.busy) t.textContent = "正在写进仓库…";
      else if (PUB.lastAt && Date.now() - PUB.lastAt < 90000) t.textContent = "已发布 · 等 Pages 重建";
      else t.textContent = "有改动还没发布";
    }
    var go = $("#pub-go");
    if (go) go.textContent = PUB.busy ? "发布中" : "发布";
  }

  function stampUpdated() {
    var el = $("#ro-stamp");
    if (!el) return;
    if (!REMOTE.publishedAt) { el.hidden = true; return; }
    var d = new Date(REMOTE.publishedAt);
    el.textContent = "· 更新于 " + (d.getMonth() + 1) + "." + d.getDate() +
      " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    el.hidden = ROLE !== "visitor";
  }

  /* --- 面板 --- */
  function openAuth() { $("#auth-modal").hidden = false; renderOwnerPanel(); }
  function closeAuth() { $("#auth-modal").hidden = true; }
  function authErr(msg) {
    var e = $("#auth-err");
    if (!e) return;
    if (!msg) { e.hidden = true; return; }
    e.textContent = msg;
    e.hidden = false;
  }

  function renderOwnerPanel() {
    var box = $("#auth-body");
    if (!box) return;
    var ttl = $("#auth-title");
    var cap = $("#auth-modal .modal-cap");

    if (ROLE === "owner") {
      if (cap) cap.textContent = "publisher";
      if (ttl) ttl.textContent = "发布";
      box.innerHTML =
        '<p class="auth-who">已接入<span>·</span>' + esc(OWNER.login || (REPO.owner + "/" + REPO.name)) + "</p>" +
        '<p class="auth-hint">改动只在这台机器上。点「发布」，内容才会写进仓库，GitHub Pages 重建之后访客才看得到。</p>' +
        '<div class="auth-row">' +
        '<button class="btn-solid" id="pub-here" type="button">发布</button>' +
        '<button class="btn-plain" id="pub-pull" type="button">丢弃本地改动</button>' +
        "</div>" +
        '<p class="auth-hint">「丢弃本地改动」会把页面换成线上那份快照，这台机器上没发布的改动就没了。</p>' +
        '<div class="auth-row">' +
        '<button class="btn-plain" id="pat-out" type="button">移除这台设备的凭证</button>' +
        "</div>";
      $("#pub-here").addEventListener("click", function () { closeAuth(); publish(); });
      $("#pub-pull").addEventListener("click", discardLocal);
      $("#pat-out").addEventListener("click", removePat);
      return;
    }

    if (cap) cap.textContent = "visitor";
    if (ttl) ttl.textContent = "这个站只有一个人能改";
    box.innerHTML =
      '<p class="auth-hint">你看到的一切，是构建那一次就写死的静态文件。访客拿到的只是字节 —— ' +
      "没有账号、没有接口、没有一枚可以提交的表单。能重写它的人手里有一把「发布凭证」，存在他自己那台浏览器里。</p>" +
      '<button class="btn-plain auth-submit" id="pat-open" type="button">我手里有发布凭证</button>' +
      '<div id="pat-form" hidden>' +
      '<label class="auth-field"><span>凭证</span>' +
      '<input type="password" id="pat-input" autocomplete="off" spellcheck="false" placeholder="github_pat_… 或 ghp_…"></label>' +
      '<p class="auth-err" id="auth-err" hidden></p>' +
      '<button class="btn-solid auth-submit" id="pat-save" type="button">验证并保存到这台设备</button>' +
      '<p class="auth-hint">在 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens 新建一枚：' +
      "只授权 <b>" + REPO.owner + "/" + REPO.name + "</b> 这一个仓库，权限只给 <b>Contents: Read and write</b>。" +
      "凭证只存在这台浏览器的本地存储里，不经过任何服务器。</p>" +
      "</div>";
    $("#pat-open").addEventListener("click", function () {
      $("#pat-form").hidden = false;
      $("#pat-input").focus();
    });
    $("#pat-save").addEventListener("click", savePat);
  }

  function savePat() {
    var v = $("#pat-input").value.trim();
    if (!v) { authErr("先粘贴一枚凭证"); return; }
    authErr("");
    var btn = $("#pat-save");
    btn.disabled = true;
    btn.textContent = "验证中";
    verifyPat(v).then(function (full) {
      setPat(v);
      OWNER.login = full;
      OWNER.verified = true;
      closeAuth();
      setRole("owner");
      toast("接上了", "这台设备现在可以改内容了");
    }).catch(function (e) {
      btn.disabled = false;
      btn.textContent = "验证并保存到这台设备";
      authErr((e && e.message) || "验证失败");
    });
  }

  function removePat() {
    setPat("");
    OWNER.login = "";
    OWNER.verified = false;
    closeAuth();
    setRole("visitor");
    toast("已移除凭证", "这台设备回到访客视角");
  }

  function discardLocal() {
    loadPublished().then(function (d) {
      if (d) {
        adoptContent(d);
        REMOTE.publishedAt = d.published_at || null;
        REMOTE.sig = sigOf(d);
      }
      try { localStorage.setItem(STORE, JSON.stringify(DB)); } catch (e) {}
      closeAuth();
      renderAll();
      stampUpdated();
      refreshOwnerUI();
      toast("已换成线上那份", "本地没发布的改动没了");
    });
  }

  $("#auth-btn").addEventListener("click", openAuth);
  $("#auth-close").addEventListener("click", closeAuth);
  $("#auth-modal").addEventListener("click", function (e) {
    if (e.target === $("#auth-modal")) closeAuth();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !$("#auth-modal").hidden) closeAuth();
  });
  var pubGo = $("#pub-go");
  if (pubGo) pubGo.addEventListener("click", publish);

  /* --- 启动：先读快照，再看这台设备有没有凭证 --- */
  function boot() {
    var hadLocal = DB.events.length || DB.habits.length || DB.notes.length;

    return loadPublished().then(function (d) {
      if (d) {
        REMOTE.publishedAt = d.published_at || null;
        REMOTE.sig = sigOf(d);
        if (!hadLocal) adoptContent(d);
      } else {
        REMOTE.publishedAt = null;
        REMOTE.sig = sigOf({ events: [], habits: [], notes: [] });
      }
      REMOTE.ready = true;
      renderAll();
      stampUpdated();

      var pat = getPat();
      if (!pat) { setRole("visitor"); return; }
      setRole("owner");
      return verifyPat(pat).then(function (full) {
        OWNER.login = full;
        OWNER.verified = true;
        renderOwnerPanel();
        refreshOwnerUI();
      }).catch(function (e) {
        setRole("visitor");
        toast("发布凭证不好使了", (e && e.message) || "点右上角重新填一次", { kind: "warn" });
      });
    });
  }

  /* ---------- 15. 启动 ---------- */
  function renderAll() {
    renderAgenda(); renderHabits(); renderNotes(); renderStats();
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
  boot();

  setInterval(function () {
    tickClock();
    checkReminders();
  }, 1000);

  // 相对时间（「还有 2 小时」）每 30 秒刷新一次，别每秒重绘列表
  setInterval(function () {
    renderAgenda();
    renderStats();
  }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { checkReminders(); renderAgenda(); }
  });

  // PWA：离线可用（https / localhost 下才生效）
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 忽略 */ });
    });
  }
})();
