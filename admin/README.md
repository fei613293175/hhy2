# P00 管理后台视觉实现

严格 P00 范围为 3 页、19 个状态：ADMIN-AUTH-001（6）、ADMIN-SEC-001（7）和 ADMIN-SELF-001（6）。仅包括 D02 中原始 release: P00 的页面；混合发布标记尚未纳入，因为 D02 没有定义其语法。

public/reference/ 是从原始 D02 包机械提取的状态 HTML 视觉基线。app.js 添加真实输入、刷新、返回恢复、验证码层和安全操作交互，图标来自登记的 D02 SVG。无认证、验证码、会话和审计 API 时，正常交互不会伪造登录、改密或结束会话成功。

原始 ADMIN-SELF-001 截图把“后台个人账号与安全”错误绘制为系统配置表；本实现保留后台壳、间距、卡片、表格与抽屉密度，但修正为账号、角色、会话和密码安全内容。查询参数 page 和 state 仅用于固定视口视觉验收，SUCCESS 也不代表真实操作成功。

仅在用户连接服务器构建与运行：

    docker build -t hhy2-admin-p00 ./admin
    docker run -d --name hhy2-admin-p00 --restart unless-stopped -p 18090:8080 hhy2-admin-p00
