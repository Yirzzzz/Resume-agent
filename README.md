# 🚀 Resume Agent

一个低门槛的 Web 简历 Agent 平台：支持多简历文件管理、结构化编辑、实时 PDF 预览与导出。

## ✨ 功能亮点
- 🧩 模块化编辑：工作/项目/科研/教育等模块可增删、排序、自定义
- 🗂️ 多简历文件：新建、切换、设默认、删除、共享角色档案
- 🎨 样式配置：字体、字号、行高、页边距、主题色可保存
- 🖼️ 头像与信息：角色档案支持头像、附加信息与图标展示
- 📄 导出稳定：基于 Playwright 的 A4 PDF 导出

## 🏗️ 项目结构
- `apps/web`：Next.js 前端（编辑器 + 预览 + 文件管理）
- `apps/api`：NestJS 后端（简历存储、模板渲染、PDF 导出）
- `schemas`：简历 JSON Schema
- `templates`：模板清单与风格配置
- `data`：本地运行数据（真实数据默认不入库）

## ⚡ 快速开始（本地开发）

### 1) 环境准备
- Node.js 20+
- pnpm 10+

### 2) 安装依赖
```bash
pnpm install
```

### 3) 初始化本地数据
```bash
cp data/resume-files.example.json data/resume-files.json
```

### 4) 一键启动前后端
```bash
pnpm dev
```

默认访问：
- 🌐 Web: `http://localhost:3000`
- 🔌 API: `http://localhost:3001`（若端口占用会自动顺延）

## 🧪 常用命令
```bash
# 仅启动前端
pnpm dev:web

# 仅启动后端
pnpm dev:api

# 构建
pnpm build

# 代码检查
pnpm lint
```

## 🐳 快速部署（Docker）
如果你准备做私有化部署，建议使用 `Docker Compose` 统一编排（Web + API）。

### 1) 构建镜像
```bash
docker compose build
```

### 2) 后台启动
```bash
docker compose up -d
```

### 3) 查看日志
```bash
docker compose logs -f
```

> 说明：如果仓库中暂未提供 `docker-compose.yml`，可先按“本地开发”方式运行，再补充容器化配置。

## ☁️ GitHub 发布最小清单
仓库已配置根 `.gitignore`，默认不提交：缓存文件、构建产物、IDE 配置、过程文档、本地真实数据。

建议发布前检查：
- ✅ `data/resume-files.example.json` 在仓库中
- ✅ `data/resume-files.json` 不在仓库中
- ✅ `node_modules/.next/.idea` 等未被提交

## 📌 协作说明
- `feature.json`：需求与任务状态
- `progress.md`：会话进度与关键决策（本地协作用，可按需入库）

## 📄 License
当前仓库未声明开源许可证。若要开源，建议补充 `MIT` 或 `Apache-2.0`。
