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
    const sourceState = page === "self" ? "DEFAULT" : state;
    return "reference/" + catalog[page].source + "__" + sourceState + ".html";
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
    style(doc, ".hhy-toast{position:fixed;z-index:100;top:78px;right:26px;max-width:390px;min-height:38px;padding:10px 14px;display:flex;align-items:center;border:1px solid #cfe6ff;border-radius:13px;color:#1c68b2;background:#fff;box-shadow:0 8px 22px rgba(10,33,88,.10);font-size:12px;font-weight:650}.hhy-toast.error{border-color:#ffc8ce;color:#b82a3b}.hhy-toast.warn{border-color:#fbe2a8;color:#a76500}.hhy-toast.success{border-color:#c5f0de;color:#0f8055}button:not([disabled]){cursor:pointer}.hhy-native-input{display:block;width:100%;height:50px;padding:0 14px;border:1px solid #c5cbd6;border-radius:14px;background:#fff;color:#11182e;font:inherit;outline:none}.hhy-native-input:focus{border-color:#315ce8;box-shadow:0 0 0 3px rgba(49,92,232,.13)}.hhy-native-input::placeholder{color:#778197}.hhy-close-button{width:32px;height:32px;padding:0;border:0;border-radius:9px;background:transparent;color:#11182e;font-size:25px;line-height:1}");
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
      go("captcha", "DEFAULT");
    });
    const feedback = {
      SUBMITTING: ["", "正在准备安全验证…"],
      LOGIN_FAILED: ["error", "认证服务尚未接入，未建立后台会话。"],
      RATE_LIMITED: ["warn", "操作过于频繁，请稍后再试。"],
      ACCOUNT_LOCKED: ["warn", "账号当前不可用，请联系安全管理员。"],
      SUCCESS: ["success", "视觉验收状态：未建立真实后台会话。"]
    };
    if (feedback[state]) toast(doc, feedback[state][0], feedback[state][1]);
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
    const feedback = {
      LOADING: ["", "正在获取一次性验证码…"],
      VERIFYING: ["", "正在核验，未签发任何会话。"],
      WRONG: ["error", "验证码输入有误或认证服务不可用，请重新发起。"],
      EXPIRED: ["warn", "本次安全验证已过期，请重新发起。"],
      RATE_LIMITED: ["warn", "验证请求过于频繁，请稍后再试。"],
      SUCCESS: ["success", "视觉验收状态：未签发一次性票据。"]
    };
    if (feedback[state]) toast(doc, feedback[state][0], feedback[state][1]);
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
    go(memory.returnPage, memory.returnState);
  }

  function asset(name) {
    return "<img class=\"hhy-icon\" src=\"/assets/" + name + ".svg\" alt=\"\" aria-hidden=\"true\">";
  }

  function selfMarkup() {
    return [
      "<div class=\"breadcrumb\">合伙云运营后台 / 账号与安全</div>",
      "<div class=\"admin-page-head hhy-page-head\"><div><div class=\"admin-page-title\">后台个人账号与安全</div><div class=\"admin-page-sub\">查看本人角色、登录会话并修改密码或退出其他会话 · ADMIN-SELF-001</div></div><div class=\"row gap8\"><button class=\"btn outline hhy-action\" data-action=\"sessions\">", asset("ICON-DEVICE"), "<span>登录会话</span></button><button class=\"btn primary hhy-action\" data-action=\"password\">", asset("ICON-KEY"), "<span>修改密码</span></button></div></div>",
      "<section class=\"hhy-grid\"><article class=\"admin-card hhy-summary\"><div class=\"hhy-summary-title\">", asset("ICON-USER"), "<span>个人资料</span></div><div class=\"hhy-profile\"><div class=\"avatar lg\"></div><div><strong>超级管理员</strong><span>admin@example.com</span></div></div><div class=\"hhy-meta\"><span>员工编号</span><strong>ADM-0001</strong></div></article>",
      "<article class=\"admin-card hhy-summary\"><div class=\"hhy-summary-title\">", asset("ICON-SHIELD"), "<span>访问角色</span></div><div class=\"hhy-role\">超级管理员</div><p>拥有平台配置、账号安全与审计查看权限。敏感操作均需二次验证。</p><span class=\"badge green\">权限状态正常</span></article>",
      "<article class=\"admin-card hhy-summary\"><div class=\"hhy-summary-title\">", asset("ICON-LOCK"), "<span>账号保护</span></div><div class=\"hhy-line\"><span>密码保护</span><strong>已启用</strong></div><div class=\"hhy-line\"><span>当前会话</span><strong>1 个活跃</strong></div><button class=\"hhy-link hhy-action\" data-action=\"sessions\">管理登录会话</button></article></section>",
      "<section class=\"admin-card hhy-table-card\"><div class=\"hhy-table-title\"><div><strong>最近登录与设备</strong><span>所有登录、改密和退出操作都会写入审计日志。</span></div><button class=\"btn ghost hhy-action\" data-action=\"sessions\">", asset("ICON-DEVICE"), "<span>查看全部</span></button></div><table class=\"admin-table hhy-table\"><thead><tr><th>设备</th><th>登录地点</th><th>最近活动</th><th>状态</th><th>操作</th></tr></thead><tbody><tr><td><strong>Windows · Edge</strong><br><span>当前设备</span></td><td>中国 · 北京</td><td>2026-08-17 10:24</td><td><span class=\"badge green\">当前会话</span></td><td><button class=\"hhy-link hhy-action\" data-action=\"password\">修改密码</button></td></tr><tr><td><strong>iPhone · Safari</strong><br><span>上次登录设备</span></td><td>中国 · 上海</td><td>2026-08-15 18:42</td><td><span class=\"badge gray\">已退出</span></td><td><button class=\"hhy-link hhy-action\" data-action=\"sessions\">查看</button></td></tr></tbody></table></section>"
    ].join("");
  }

  function selfStyle() {
    return ".hhy-page-head{margin-bottom:16px}.hhy-action{display:inline-flex;align-items:center;gap:8px}.hhy-icon{width:16px;height:16px;display:block;object-fit:contain}.hhy-grid{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:14px;margin-bottom:14px}.hhy-summary{min-height:174px;padding:17px}.hhy-summary-title{display:flex;align-items:center;gap:8px;color:#26344d;font-size:14px;font-weight:760}.hhy-summary-title .hhy-icon{width:20px;height:20px}.hhy-profile{display:flex;align-items:center;gap:12px;margin-top:14px}.hhy-profile strong,.hhy-profile span{display:block}.hhy-profile strong{font-size:16px;color:#13203a}.hhy-profile span{margin-top:4px;color:#6f7b90;font-size:12px}.hhy-meta{display:flex;justify-content:space-between;margin-top:14px;padding-top:12px;border-top:1px solid #e7ebf1;color:#738097;font-size:12px}.hhy-meta strong{color:#26344d}.hhy-role{margin:17px 0 7px;color:#17265b;font-size:17px;font-weight:780}.hhy-summary p{min-height:35px;margin:0 0 11px;color:#6f7b90;font-size:12px;line-height:18px}.hhy-line{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e7ebf1;color:#738097;font-size:12px}.hhy-line strong{color:#26344d}.hhy-link{margin-top:12px;padding:0;border:0;background:none;color:#215bdd;font-family:inherit;font-size:12px;font-weight:700}.hhy-table-card{padding:0;overflow:hidden}.hhy-table-title{min-height:72px;padding:16px 18px 13px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dce3ed}.hhy-table-title strong,.hhy-table-title span{display:block}.hhy-table-title strong{color:#13203a;font-size:15px}.hhy-table-title span{margin-top:5px;color:#738097;font-size:12px}.hhy-table-title .btn{height:36px;padding:0 13px;border-radius:11px}.hhy-table td{height:58px}.hhy-table td span{color:#738097;font-size:11px}.hhy-backdrop{position:fixed;z-index:42;inset:0;background:rgba(5,13,35,.48);backdrop-filter:blur(2px)}.hhy-drawer{position:fixed;z-index:43;top:0;right:0;width:500px;height:100vh;padding:26px 22px;overflow:auto;background:#fff;box-shadow:-28px 0 72px rgba(5,18,55,.24)}.hhy-drawer-top{display:flex;align-items:center;justify-content:space-between;color:#13203a;font-size:22px;font-weight:800}.hhy-close{width:38px;height:38px;border:0;border-radius:11px;background:#f3f6fa;color:#13203a;font-size:24px}.hhy-drawer-sub{margin:6px 0 18px;color:#738097;font-size:12px}.hhy-drawer-card{padding:17px;border:1px solid #dce3ed;border-radius:15px;box-shadow:0 5px 18px rgba(10,33,88,.055)}.hhy-drawer-card+.hhy-drawer-card{margin-top:14px}.hhy-drawer-card h3{margin:0 0 14px;color:#13203a;font-size:15px}.hhy-field{margin-top:12px}.hhy-field label{display:block;margin-bottom:7px;color:#5e6b81;font-size:12px;font-weight:700}.hhy-field input{width:100%;height:42px;padding:0 12px;border:1px solid #cbd7e7;border-radius:11px;outline:none;color:#26344d}.hhy-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.hhy-actions .btn{height:40px;border-radius:11px}.hhy-session{display:flex;align-items:center;gap:11px;padding:13px 0;border-top:1px solid #e7ebf1}.hhy-session:first-of-type{border-top:0}.hhy-session>div{flex:1}.hhy-session strong,.hhy-session span{display:block}.hhy-session span{margin-top:4px;color:#738097;font-size:11px}.hhy-end{width:54px;height:30px;border:0;border-radius:9px;background:#ffe7ea;color:#b82a3b;font-size:12px;font-weight:700}.hhy-alert{margin-bottom:14px;padding:12px 13px;border-radius:12px;background:#ffe7ea;color:#b82a3b;font-size:12px;line-height:18px}";
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
      go("captcha", "DEFAULT");
    }));
    doc.body.append(backdrop, drawer);
  }

  function bindSelf(doc, state) {
    style(doc, selfStyle());
    const selected = doc.querySelector(".admin-menu-item.active span");
    if (selected) selected.textContent = "账号与安全";
    const content = doc.querySelector(".admin-body");
    if (!content) return;
    content.innerHTML = selfMarkup();
    content.querySelectorAll(".hhy-action").forEach((item) => item.addEventListener("click", () => {
      go("self", item.dataset.action === "password" ? "EDIT_PASSWORD" : "SESSION_LIST");
    }));
    if (state === "EDIT_PASSWORD") openDrawer(doc, "password");
    if (state === "SESSION_LIST") openDrawer(doc, "sessions");
    if (state === "SUBMITTING") toast(doc, "", "正在准备安全验证…");
    if (state === "SUCCESS") toast(doc, "success", "视觉验收状态：未修改任何账号数据。");
    if (state === "ERROR") {
      const warning = doc.createElement("div");
      warning.className = "hhy-alert";
      warning.textContent = "账号安全服务尚未接入，未执行密码修改或会话退出操作。";
      content.prepend(warning);
    }
  }

  window.addEventListener("popstate", render);
  render();
})();
