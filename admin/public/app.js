(() => {
  "use strict";

  const catalog = {
    auth: { source: "ADMIN-AUTH-001", fallback: "DEFAULT", states: ["DEFAULT", "SUBMITTING", "LOGIN_FAILED", "RATE_LIMITED", "ACCOUNT_LOCKED", "SUCCESS"] },
    captcha: { source: "ADMIN-SEC-001", fallback: "DEFAULT", states: ["LOADING", "DEFAULT", "VERIFYING", "WRONG", "EXPIRED", "RATE_LIMITED", "SUCCESS"] },
    self: { source: "ADMIN-SELF-001", fallback: "DEFAULT", states: ["DEFAULT", "EDIT_PASSWORD", "SESSION_LIST", "SUBMITTING", "SUCCESS", "ERROR"] }
  };

  const memory = {
    account: "admin@example.com",
    password: "",
    captcha: "",
    captchaCode: "7K4M",
    returnPage: "auth",
    returnState: "DEFAULT",
    canReturn: false,
    selfDrawer: null,
    passwordFields: { current: "", next: "", confirm: "" }
  };

  const root = document.querySelector("#app");

  function route() {
    const params = new URLSearchParams(window.location.search);
    const page = catalog[params.get("page")] ? params.get("page") : "auth";
    const requested = params.get("state");
    const state = catalog[page].states.includes(requested) ? requested : catalog[page].fallback;
    return { page, state };
  }

  function go(page, state, replace) {
    const url = window.location.pathname + "?page=" + encodeURIComponent(page) + "&state=" + encodeURIComponent(state);
    window.history[replace ? "replaceState" : "pushState"]({ page, state }, "", url);
    render();
  }

  function sourceFor(page, state) {
    return "reference/" + catalog[page].source + "__" + state + ".html";
  }

  function render() {
    const current = route();
    const frame = document.createElement("iframe");
    frame.className = "reference-frame";
    frame.title = "合伙云 Pro 管理后台";
    frame.src = sourceFor(current.page, current.state);
    frame.addEventListener("load", () => hydrate(frame, current), { once: true });
    root.replaceChildren(frame);
  }

  function style(doc, content) {
    const node = doc.createElement("style");
    node.textContent = content;
    doc.head.append(node);
  }

  function toast(doc, tone, message) {
    if (!message) return;
    const node = doc.createElement("div");
    node.className = "hhy-toast " + tone;
    node.textContent = message;
    doc.body.append(node);
  }

  function hydrate(frame, current) {
    const doc = frame.contentDocument;
    if (!doc) return;
    style(doc, ".hhy-toast{position:fixed;z-index:100;top:78px;right:26px;max-width:390px;min-height:38px;padding:10px 14px;display:flex;align-items:center;border:1px solid #cfe6ff;border-radius:13px;color:#1c68b2;background:#fff;box-shadow:0 8px 22px rgba(10,33,88,.10);font-size:12px;font-weight:650}.hhy-toast.error{border-color:#ffc8ce;color:#b82a3b}.hhy-toast.warn{border-color:#fbe2a8;color:#a76500}.hhy-toast.success{border-color:#c5f0de;color:#0f8055}button:not([disabled]){cursor:pointer}.hhy-native-input{display:block;width:100%;height:50px;padding:0 14px;border:1px solid #c5cbd6;border-radius:14px;background:#fff;color:#11182e;font:inherit;outline:none}.hhy-native-input:focus{border-color:#315ce8;box-shadow:0 0 0 3px rgba(49,92,232,.13)}.hhy-native-input::placeholder{color:#778197}.hhy-close-button{width:32px;height:32px;padding:0;border:0;border-radius:9px;background:transparent;color:#11182e}.hhy-close-button .hhy-icon{display:block;width:18px;height:18px;margin:auto}");
    if (current.page === "auth") bindAuth(doc, current.state);
    if (current.page === "captcha") bindCaptcha(doc, current.state);
    if (current.page === "self") bindSelf(doc, current.state);
  }

  function button(doc, text) {
    return [...doc.querySelectorAll("button")].find((item) => item.textContent.includes(text));
  }

  function nativeInput(doc, target, options) {
    if (!target) return null;
    const input = doc.createElement("input");
    input.className = "hhy-native-input";
    input.type = options.type || "text";
    input.name = options.name;
    input.autocomplete = options.autocomplete || "off";
    input.placeholder = options.placeholder || "";
    input.value = options.value || "";
    input.style.cssText = target.style.cssText;
    if (options.maxLength) input.maxLength = options.maxLength;
    target.replaceWith(input);
    return input;
  }

  function replaceCloseIcon(doc) {
    const heading = [...doc.querySelectorAll("div")].find((item) => item.textContent.trim() === "安全验证");
    const row = heading && heading.parentElement;
    const icon = row && row.querySelector("svg.icon");
    if (!icon) return null;
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "hhy-close-button";
    close.setAttribute("aria-label", "关闭安全验证");
    close.innerHTML = asset("ICON-CLOSE");
    icon.replaceWith(close);
    return close;
  }

  function bindAuth(doc, state) {
    const placeholders = [...doc.querySelectorAll(".login-panel .input")];
    const account = nativeInput(doc, placeholders[0], {
      name: "account",
      value: memory.account,
      autocomplete: "username"
    });
    const password = nativeInput(doc, placeholders[1], {
      name: "password",
      type: "password",
      value: memory.password,
      autocomplete: "current-password"
    });
    if (account) {
      account.addEventListener("input", () => { memory.account = account.value; });
    }
    if (password) {
      password.addEventListener("input", () => { memory.password = password.value; });
    }
    const login = button(doc, "登录管理后台");
    if (login) login.addEventListener("click", () => {
      memory.returnPage = "auth";
      memory.returnState = "DEFAULT";
      memory.canReturn = true;
      go("captcha", "DEFAULT");
    });
  }

  function bindCaptcha(doc, state) {
    const placeholder = [...doc.querySelectorAll(".modal .input")].find((item) => item.textContent.includes("输入图中字符"));
    const field = nativeInput(doc, placeholder, {
      name: "captcha",
      value: memory.captcha,
      placeholder: "输入图中字符",
      maxLength: 4,
      autocomplete: "off"
    });
    if (field) {
      field.addEventListener("input", () => { memory.captcha = field.value.toUpperCase(); });
      field.addEventListener("keydown", (event) => {
        if (event.key === "Escape") returnFromCaptcha();
      });
    }
    const close = replaceCloseIcon(doc);
    if (close) close.addEventListener("click", returnFromCaptcha);
    const refresh = button(doc, "换一张");
    if (refresh) refresh.addEventListener("click", () => refreshCaptcha(doc, field));
    const verify = button(doc, "完成验证");
    if (verify) verify.addEventListener("click", () => {
      if (!field || !field.value.trim()) {
        go("captcha", "WRONG");
        return;
      }
      go("captcha", "VERIFYING");
      window.setTimeout(() => {
        memory.captcha = "";
        go("captcha", "WRONG", true);
      }, 320);
    });
  }

  function refreshCaptcha(doc, field) {
    const codes = ["7K4M", "P9X2", "M6Q8", "A3TZ"];
    memory.captchaCode = codes[(codes.indexOf(memory.captchaCode) + 1) % codes.length];
    [...doc.querySelectorAll("div,span")]
      .filter((item) => item.children.length === 0 && /^(7K4M|P9X2|M6Q8|A3TZ)$/.test(item.textContent.trim()))
      .forEach((item) => { item.textContent = memory.captchaCode; });
    memory.captcha = "";
    if (field) {
      field.value = "";
      field.focus();
    }
  }

  function returnFromCaptcha() {
    memory.captcha = "";
    if (memory.canReturn) {
      memory.canReturn = false;
      window.history.back();
      return;
    }
    go(memory.returnPage, memory.returnState, true);
  }

  function asset(name) {
    return "<img class=\"hhy-icon\" src=\"/assets/" + name + ".svg\" alt=\"\" aria-hidden=\"true\">";
  }

  function selfMarkup() {
    return [
      "<div class=\"breadcrumb\">合伙云运营后台 / 账号与安全</div>",
      "<div class=\"admin-page-head hhy-page-head\"><div><div class=\"admin-page-title\">后台个人账号与安全</div><div class=\"admin-page-sub\">查看本人角色、登录会话并修改密码或退出其他会话 · ADMIN-SELF-001</div></div><div class=\"row gap8\"><button class=\"btn outline hhy-action\" data-action=\"sessions\">", asset("ICON-DEVICE"), "<span>登录会话</span></button><button class=\"btn primary hhy-action\" data-action=\"password\">", asset("ICON-KEY"), "<span>修改密码</span></button></div></div>",
      "<section class=\"admin-card filter-bar hhy-filter\"><label class=\"hhy-filter-search\">", asset("ICON-SEARCH"), "<input id=\"session-search\" type=\"search\" placeholder=\"搜索设备、地点或会话编号\"></label><label class=\"hhy-filter-select\"><select id=\"session-status\"><option value=\"all\">全部状态</option><option value=\"active\">当前会话</option><option value=\"closed\">已退出</option></select></label><label class=\"hhy-filter-select\"><select id=\"session-type\"><option value=\"all\">全部设备类型</option><option value=\"desktop\">桌面设备</option><option value=\"mobile\">移动设备</option></select></label><label class=\"hhy-filter-date\"><input id=\"session-date\" type=\"date\" value=\"2026-08-17\"></label><button class=\"btn primary hhy-filter-query\" type=\"button\">查询</button><button class=\"btn ghost hhy-filter-reset\" type=\"button\">重置</button></section>",
      "<section class=\"admin-card hhy-session-table\"><table class=\"admin-table\"><thead><tr><th>会话编号</th><th>设备</th><th>账号与角色</th><th>登录地点</th><th>最近活动</th><th>状态</th><th>操作</th></tr></thead><tbody id=\"session-rows\"><tr data-status=\"active\" data-type=\"desktop\"><td>SES-20260817-001</td><td>Windows · Edge</td><td>超级管理员</td><td>中国 · 北京</td><td>2026-08-17 10:24</td><td><span class=\"badge green\">当前会话</span></td><td><button class=\"hhy-link hhy-action\" data-action=\"password\">修改密码</button></td></tr><tr data-status=\"closed\" data-type=\"mobile\"><td>SES-20260816-002</td><td>iPhone · Safari</td><td>超级管理员</td><td>中国 · 上海</td><td>2026-08-16 20:16</td><td><span class=\"badge gray\">已退出</span></td><td><button class=\"hhy-link hhy-action\" data-action=\"sessions\">查看</button></td></tr><tr data-status=\"closed\" data-type=\"desktop\"><td>SES-20260815-003</td><td>macOS · Chrome</td><td>超级管理员</td><td>中国 · 深圳</td><td>2026-08-15 18:42</td><td><span class=\"badge gray\">已退出</span></td><td><button class=\"hhy-link hhy-action\" data-action=\"sessions\">查看</button></td></tr></tbody></table><div class=\"pagination\"><span id=\"session-count\">共 3 条，每页 20 条</span><div class=\"pager\"><div class=\"page-dot active\">1</div><div class=\"page-dot\">2</div><div class=\"page-dot\">3</div><div class=\"page-dot\">…</div></div></div></section>"
    ].join("");
  }

  function selfStyle() {
    return ".hhy-page-head{margin-bottom:16px}.hhy-page-head .btn{height:38px;border-radius:11px;padding:0 13px}.hhy-action{display:inline-flex;align-items:center;gap:8px}.hhy-icon{width:16px;height:16px;display:block;object-fit:contain}.hhy-filter{height:66px;margin-bottom:14px;padding:13px!important}.hhy-filter-search{height:38px;min-width:250px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid #cbd7e7;border-radius:11px;background:#fff;color:#738097}.hhy-filter-search .hhy-icon{width:14px;height:14px}.hhy-filter-search input{width:205px;padding:0;border:0;outline:0;background:transparent;color:#26344d;font:inherit;font-size:12px}.hhy-filter-search input::placeholder{color:#738097}.hhy-filter-select{height:38px;min-width:150px;position:relative;border:1px solid #cbd7e7;border-radius:11px;background:#fff}.hhy-filter-select:after{content:\"⌄\";position:absolute;right:12px;top:8px;color:#738097;font-size:14px;pointer-events:none}.hhy-filter-select select{width:100%;height:100%;padding:0 28px 0 12px;border:0;outline:0;background:transparent;color:#59667d;font:inherit;font-size:12px;appearance:none}.hhy-filter-date{height:38px;width:156px;padding:0 8px;border:1px solid #cbd7e7;border-radius:11px;background:#fff}.hhy-filter-date input{width:100%;height:100%;border:0;outline:0;background:transparent;color:#59667d;font:inherit;font-size:12px}.hhy-filter-query,.hhy-filter-reset{height:38px!important}.hhy-session-table{overflow:hidden}.hhy-session-table .admin-table th,.hhy-session-table .admin-table td{padding:0 14px}.hhy-session-table .admin-table td:last-child{white-space:normal}.hhy-session-table .hhy-link{margin:0}.hhy-backdrop{position:fixed;z-index:42;inset:0;background:rgba(5,13,35,.48);backdrop-filter:blur(2px)}.hhy-drawer{position:fixed;z-index:43;top:0;right:0;width:500px;height:100vh;padding:26px 22px;overflow:auto;background:#fff;box-shadow:-28px 0 72px rgba(5,18,55,.24)}.hhy-drawer-top{display:flex;align-items:center;justify-content:space-between;color:#13203a;font-size:22px;font-weight:800}.hhy-close{width:38px;height:38px;border:0;border-radius:11px;background:#f3f6fa;color:#13203a;font-size:24px}.hhy-close .hhy-icon{width:17px;height:17px;margin:auto}.hhy-drawer-sub{margin:6px 0 18px;color:#738097;font-size:12px}.hhy-drawer-card{padding:17px;border:1px solid #dce3ed;border-radius:15px;box-shadow:0 5px 18px rgba(10,33,88,.055)}.hhy-drawer-card+.hhy-drawer-card{margin-top:14px}.hhy-drawer-card h3{margin:0 0 14px;color:#13203a;font-size:15px}.hhy-field{margin-top:12px}.hhy-field label{display:block;margin-bottom:7px;color:#5e6b81;font-size:12px;font-weight:700}.hhy-field input{width:100%;height:42px;padding:0 12px;border:1px solid #cbd7e7;border-radius:11px;outline:none;color:#26344d}.hhy-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.hhy-actions .btn{height:40px;border-radius:11px}.hhy-session{display:flex;align-items:center;gap:11px;padding:13px 0;border-top:1px solid #e7ebf1}.hhy-session:first-of-type{border-top:0}.hhy-session>div{flex:1}.hhy-session strong,.hhy-session span{display:block}.hhy-session span{margin-top:4px;color:#738097;font-size:11px}.hhy-end{width:54px;height:30px;border:0;border-radius:9px;background:#ffe7ea;color:#b82a3b;font-size:12px;font-weight:700}.hhy-alert{margin-bottom:14px;padding:12px 13px;border-radius:12px;background:#ffe7ea;color:#b82a3b;font-size:12px;line-height:18px}";
  }

  function openDrawer(doc, type) {
    const backdrop = doc.createElement("div");
    backdrop.className = "hhy-backdrop";
    const drawer = doc.createElement("aside");
    drawer.className = "hhy-drawer";
    const title = type === "password" ? "修改登录密码" : "登录会话";
    const body = type === "password"
      ? "<div class=\"hhy-drawer-card\"><h3>设置新密码</h3><div class=\"hhy-field\"><label>当前密码</label><input type=\"password\"></div><div class=\"hhy-field\"><label>新密码</label><input type=\"password\"></div><div class=\"hhy-field\"><label>确认新密码</label><input type=\"password\"></div><div class=\"hhy-actions\"><button class=\"btn outline hhy-dismiss\">取消</button><button class=\"btn primary hhy-protected\">提交安全验证</button></div></div>"
      : "<div class=\"hhy-drawer-card\"><h3>活跃会话</h3><div class=\"hhy-session\">" + asset("ICON-DEVICE") + "<div><strong>Windows · Edge</strong><span>北京 · 2026-08-17 10:24 · 当前设备</span></div><span class=\"badge green\">当前</span></div><div class=\"hhy-session\">" + asset("ICON-DEVICE") + "<div><strong>iPhone · Safari</strong><span>上海 · 2026-08-16 20:16</span></div><button class=\"hhy-end hhy-protected\">退出</button></div></div><div class=\"hhy-drawer-card\"><h3>会话保护</h3><p style=\"margin:0;color:#738097;font-size:12px;line-height:18px\">结束其他登录会话需要完成一次安全验证。</p><div class=\"hhy-actions\"><button class=\"btn danger hhy-protected\">退出其他会话</button></div></div>";
    drawer.innerHTML = "<div class=\"hhy-drawer-top\"><span>" + title + "</span><button class=\"hhy-close\" aria-label=\"关闭\">" + asset("ICON-CLOSE") + "</button></div><p class=\"hhy-drawer-sub\">敏感操作会被记录到后台审计日志。</p>" + body;
    const dismiss = () => go("self", "DEFAULT");
    backdrop.addEventListener("click", dismiss);
    drawer.querySelector(".hhy-close").addEventListener("click", dismiss);
    drawer.querySelectorAll(".hhy-dismiss").forEach((item) => item.addEventListener("click", dismiss));
    drawer.querySelectorAll("input[type=password]").forEach((input, index) => {
      const key = ["current", "next", "confirm"][index];
      input.value = memory.passwordFields[key];
      input.addEventListener("input", () => { memory.passwordFields[key] = input.value; });
    });
    drawer.querySelectorAll(".hhy-protected").forEach((item) => item.addEventListener("click", () => {
      memory.returnPage = "self";
      memory.returnState = type === "password" ? "EDIT_PASSWORD" : "SESSION_LIST";
      memory.canReturn = true;
      memory.selfDrawer = type;
      go("captcha", "DEFAULT");
    }));
    doc.body.append(backdrop, drawer);
  }

  function bindSessionFilters(doc) {
    const search = doc.querySelector("#session-search");
    const status = doc.querySelector("#session-status");
    const type = doc.querySelector("#session-type");
    const rows = [...doc.querySelectorAll("#session-rows tr")];
    const count = doc.querySelector("#session-count");
    const apply = () => {
      const keyword = search.value.trim().toLowerCase();
      let visible = 0;
      rows.forEach((row) => {
        const matchesKeyword = !keyword || row.textContent.toLowerCase().includes(keyword);
        const matchesStatus = status.value === "all" || row.dataset.status === status.value;
        const matchesType = type.value === "all" || row.dataset.type === type.value;
        const show = matchesKeyword && matchesStatus && matchesType;
        row.hidden = !show;
        if (show) visible += 1;
      });
      count.textContent = "共 " + visible + " 条，每页 20 条";
    };
    doc.querySelector(".hhy-filter-query").addEventListener("click", apply);
    doc.querySelector(".hhy-filter-reset").addEventListener("click", () => {
      search.value = "";
      status.value = "all";
      type.value = "all";
      apply();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Enter") apply();
    });
  }

  function bindSelf(doc, state) {
    style(doc, selfStyle());
    doc.body.dataset.stateId = state;
    doc.querySelectorAll(".admin-drawer,.drawer-backdrop").forEach((item) => item.remove());
    const selected = doc.querySelector(".admin-menu-item.active span");
    if (selected) selected.textContent = "账号与安全";
    const content = doc.querySelector(".admin-body");
    if (!content) return;
    content.innerHTML = selfMarkup();
    content.querySelectorAll(".hhy-action").forEach((item) => item.addEventListener("click", () => {
      const action = item.dataset.action;
      memory.selfDrawer = action === "password" ? "password" : "sessions";
      go("self", action === "password" ? "EDIT_PASSWORD" : "SESSION_LIST");
    }));
    bindSessionFilters(doc);
    if (state === "EDIT_PASSWORD") openDrawer(doc, "password");
    if (state === "SESSION_LIST") openDrawer(doc, "sessions");
  }

  window.addEventListener("popstate", render);
  render();
})();
