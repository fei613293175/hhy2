# 合伙云 Pro

这是合伙云 Pro D02 的工程基线仓库。当前仓库从空仓开始，先收敛跨端合同，再接入 Android、H5 和管理后台实现。

## 当前状态

- 设计基线：4.0.0-D02（曜石星云·大型平台级资源增长系统）
- 设计交付：184 个页面、1,153 个页面状态
- 仓库状态：D02 实施层已建立；Android 目录中的早期探索代码未通过 D02 全量验收，不能作为完整实现完成的依据
- 构建状态：未在本机安装依赖、构建或启动（按 AGENTS.md 约束）；已有构建仅在用户连接服务器执行

## 目录

- `contracts/`：跨端可执行合同，包括页面路由、状态、返回恢复和核心发布流程
- `docs/`：开发前必须补齐的接口、数据和环境合同
- `design/`：D02 设计资产落库后的索引位置（不复制巨型原型产物）
- `design/implementation/`：D02 的派生 Token、页面追踪清单和服务器审计报告
- `scripts/audit_d02_package.py`：对不可变原始 ZIP 复跑完整性和可实施性审计

## 设计源

实现只能以 D02 设计包中的以下文件为视觉事实源：

1. `DESIGN_TOKENS.json`
2. `ICON_REGISTRY_D02.yaml`
3. `PAGE_INDEX_D02.yaml`
4. `STATE_RENDER_MATRIX_D02.yaml`
5. `page_specs/` 和对应状态 HTML/PNG

## 重要边界

设计包不是生产源码。页面状态合同不等于 API、数据库、支付、上传或权限实现；这些缺口必须在开发前显式补齐，禁止用静态 HTML 伪装成已完成业务。

## 下一步

先补齐 `design/implementation/D02_IMPLEMENTATION_GATES.yaml` 中的阻断合同，再在用户连接的服务器上选定技术栈、接入 `contracts/`，按闭环分批实现。
