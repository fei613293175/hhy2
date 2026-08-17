# P00 实施记录

P00 以 V4.1.0 的 `READY_FOR_P00_DIRECT_DEVELOPMENT` 为输入，交付可运行单仓骨架：Go API、Worker、PostgreSQL 迁移、Redis 编排、Admin/H5 壳、运行配置样例和 CI 合同。

## 已实现边界

- `/health/live` 与 `/health/ready`：ready 同时检查 PostgreSQL 和 Redis TCP 可达性。
- `/api/v1/p00/config`：仅返回非密钥项目配置，并明确现网对象存储事实。
- `/api/v1/p00/preflight`：只返回 R2 兼容对象存储、SMTP、实名、富运、XApay、出款证书映射是否已配置，绝不返回变量值或密钥。
- 自研图形验证码创建/验证：服务端会话、128-bit 随机挑战、PNG Base64、HMAC-SHA256、120 秒挑战、3 次错误上限、180 秒一次性票据。
- 迁移包含 P00 所需的后台账号/会话、验证码、配置和 Outbox 基础表；版本迁移以 PostgreSQL advisory lock、单事务和 `schema_migrations` 记录执行，已写入的配置不会被重启覆盖。
- `configs/integrations.example.yaml` 映射 R2 兼容对象存储、SMTP、实名、富运、XApay 和支付宝证书出款所需的服务器变量；示例不含任何密钥、证书或实际值。
- Admin 保留 D02 P00 三页 19 状态视觉实现；H5 具备独立可运行壳；Android 使用 Kotlin + Compose Activity 承载已有的精确 360×800 D02 启动状态视图。

## 现网对象存储事实覆盖

开发包把 `oss.orbexa.cc` 标记为 obsolete，但项目所有者已确认它现网可用，桶为 `fuylink`。本实现将 `https://oss.orbexa.cc` 标为公开资源基址，使用 `fuylink` 与 `hhy/prod/` 前缀；S3 兼容 API endpoint 则单独保留为服务器私有变量，尚未把公开域名误当作存储 API。未执行迁移、删除或 DNS 替换。

## 服务器运行

在已连接服务器的私有目录生成 `.env`（不要提交），至少设置 `DATABASE_PASSWORD` 和由服务器随机生成且跨版本稳定的 `CAPTCHA_HMAC_SECRET`，再运行：

```sh
docker compose up -d --build
curl -fsS https://hhy-api.orbexa.cc/health/ready
```

P00 不包含真实登录、实名、支付或提现；这些属于 R01/R05/R08，不能用静态成功页替代。Android 壳已有改动时，必须在空闲真实 Android 设备连接后，安装 APK 并完成逐页截图、交互、崩溃/ANR/logcat 检查；当前不可用的真机不能用模拟器替代。
