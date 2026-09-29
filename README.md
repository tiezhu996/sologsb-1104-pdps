# 榫卯结构拆解图鉴

面向传统木作学习者与家具设计人员的纯前端单页应用。项目把榫卯类型、构件尺寸、配合公差、拆装步骤、内联 SVG 示意图与适用家具整理为一套可查询、可编排、可追溯的本地图鉴，所有数据均保存在当前浏览器中。

## Docker 一键启动

```bash
cp .env.example .env && docker compose up -d --build
```

服务启动后访问：`http://localhost:21804`

停止服务：

```bash
docker compose down
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| UI | React 18、TypeScript 5 |
| 构建 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 路由 | React Router 6 |
| 状态 | Zustand 4 |
| 本地数据 | Dexie 4、IndexedDB |
| 容器 | Docker 多阶段构建、Nginx |

## 访问地址

- 宿主机端口：`21804`
- 页面地址：`http://localhost:21804`
- 前端路由回退由 Nginx 的 `try_files` 规则处理。

## 本地开发方式

```bash
cd frontend
npm install
npm run dev
```

类型检查与生产构建：

```bash
cd frontend
npm run build
```

本地开发默认使用 Vite 的 `5173` 端口；应用数据由浏览器中的 Dexie 数据库维护，不需要后端服务。

## 目录结构

```text
.
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/common/   共享 SVG、步骤轨道、尺寸字段和标签
│   │   ├── hooks/               步序编排与 SVG 热区解析
│   │   ├── pages/               图鉴、详情、步序、绘制台与家具反查
│   │   ├── router/              前端路由
│   │   ├── stores/              Zustand 状态与数据落库
│   │   ├── types/               核心数据模型
│   │   ├── utils/               Dexie、尺寸换算与 JSON 导出
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .env.example
└── README.md
```

## 数据存储说明

应用使用 IndexedDB，数据库封装库为 Dexie 4，库名为 `gbmortise-db`。

- `version(1)`：建立 `joints`、`members`、`steps`、`diagrams`、`furniture` 五张表及查询索引。
- `version(2)`：执行升级迁移，为五张表回填 `schemaRev = 2` 字段。
- `version(3)`：新增只追加的 `jointVersions` 版本档案表；旧库升级时为每个已有类型按当前内容自动补首次版本，旧记录不做改动。
- 首次创建数据库时通过 Dexie `populate` 回调写入榫卯、构件、步骤、内联 SVG、家具关联及各类型首次版本的种子数据。
- 新建记录、尺寸修改、SVG 保存和步骤拖拽调序都会实时写回 IndexedDB，同时整版归档（文字、构件、步序、示意图、家具关系）；旧版本永不修改，刷新页面后仍可读取。

## 版本档案与恢复

类型详情页提供「版本档案」：每次保存都新增一条不可变快照，记录当时的类型文字、构件尺寸、拆装步序、内联 SVG 示意图（含热区）与家具关系。

- **不可变**：版本只增不改，后续编辑不会影响历史版本；恢复动作本身也不制造伪版本。
- **恢复前校验引用完整性**：缺构件（热区或 SVG 源引用的构件不存在）、缺步骤图（示意图绑定的步序丢失）、步序序号重复，或混入其他类型资料时，会列出原因并拒绝恢复。
- **整体替换**：校验通过后在单个 Dexie 读写事务内替换该类型的五张活表；写入失败事务自动回滚，数据库维持现状。
- **旧记录兼容**：v2 旧库由 `version(3)` 升级自动补首次版本；运行时另有兜底，为任何缺失档案的类型补录 v1。
- **导出**：单类型导出严格按 `jointTypeId` 过滤，并携带该类型的全部版本快照；其他类型的资料与版本均不会混入。全部数据导出同时包含 `jointVersions`。

## 核心功能与路由表

| 路由 | 页面 | 核心功能 |
| --- | --- | --- |
| `/` | 入口重定向 | 自动进入榫卯图鉴 |
| `/joints` | 榫卯图鉴总览 | 按家族与难度分组，新建类型，显示构件数与步骤数，导出全部数据 |
| `/joints/:id` | 类型详情 | 查看尺寸表、公差校验、适用家具与步骤；版本档案与整版恢复；导出当前类型 |
| `/joints/:id/steps` | 拆装步序编排 | 原生拖拽调序并落库，逐步预览内联 SVG 与风险提醒 |
| `/joints/:id/diagram` | 示意图绘制台 | 点击热区回填构件，编辑构件名称、尺寸与 SVG 源 |
| `/furniture` | 家具榫卯反查 | 按家具聚合使用部位与承力说明，新建家具关联 |
