# 《林间回响》前端 QA 测试报告

- **执行人**：Edward（QA Engineer / software-qa-engineer-2）
- **日期**：2026-08-01
- **范围**：frontend/ 全量构建验证 + 核心模块单元测试（store 阈值-物种联动 / mockData 数据契约 / 工具函数）
- **测试框架**：Node.js 内置 `node:test` + `node:assert`（零新增依赖，可独立运行、可复现）
- **运行命令**：`cd frontend && npm test`（等价于 `node --test "tests/**/*.test.js"`）

---

## 1. 构建结果

| 项目 | 结果 |
|---|---|
| 依赖安装 | ✅ 跳过（`node_modules` 已存在，未触发网络请求） |
| `npm run build` | ✅ **成功**，退出码 0 |
| Vite 版本 | v5.4.21 |
| 编译模块数 | 54 modules transformed |
| 构建耗时 | 1.62s |
| 产物 | `dist/index.html` (1.00 kB) · `dist/assets/index-BUCI8bmA.css` (24.27 kB) · `dist/assets/index-Br7MKQyS.js` (169.30 kB) |
| 编译错误 | 无 |

**结论：构建通过，无编译错误。**

---

## 2. 测试文件清单

| 文件 | 覆盖内容 |
|---|---|
| `tests/mockData.test.js` | SPECIES / INDICES / LIVABILITY / HEATMAP / MAP_POINTS / SUGGESTIONS / HISTORY 数据结构；`buildAnalysis`、`analysisForHistory`、`gradeOf`、`livabilityDesc` 工具函数 |
| `tests/appStore.test.js` | `appStore.jsx` reducer 全部 action（GO/BACK/TAB/START_ANALYSIS/COMPLETE_ANALYSIS/LOAD_HISTORY/SET_THRESHOLD/SET_HIGHPASS/SET_REALTIME/TOAST/TOAST_CLEAR/default）；**核心：SET_THRESHOLD 阈值-物种联动**（0.30 全显示 / 0.90 隐藏更多 / 0.94 空态 / 边界 >= 语义 / 纯函数不可变性） |
| `tests/dataContract.test.js` | 静态扫描全部 9 屏 + 组件源码：`analysis.*` 字段契约、物种行/指数/历史字段契约、mockData 具名导入有效性、设置滑杆(0.30–0.90) ↔ 物种清单可见数(9/7/1) 端到端一致性 |

> 说明：`src/store/appStore.jsx` 未导出 reducer/initialState 且为 JSX，无法被 Node 直接 import。为避免修改业务源码，`appStore.test.js` 采用**源码块提取**方式读取文件原文中的 reducer/initialState 并在隔离作用域执行（二者均为纯函数/纯数据，仅依赖内建 API 与 buildAnalysis/HISTORY），始终基于文件最新内容，不存在复制漂移。

---

## 3. 用例清单与状态（52 个用例）

### 3.1 tests/appStore.test.js — 全局状态 reducer（6 组 21 用例）

| 用例 | 状态 |
|---|---|
| initialState：默认字段与阈值 0.5 | ✅ PASS |
| initialState：默认 analysis 由 buildAnalysis 构建且 speciesCount=9 | ✅ PASS |
| reducer 未知 action（default 分支）返回原 state 引用 | ✅ PASS |
| GO 记录返回栈并切换 screen | ✅ PASS |
| BACK 弹出返回栈恢复上一屏 | ✅ PASS |
| BACK 在空栈时回退到 home 且不崩溃 | ✅ PASS |
| TAB 设置 tab/screen 并清空返回栈 | ✅ PASS |
| START_ANALYSIS 设置 recording 并进入 analyzing | ✅ PASS |
| COMPLETE_ANALYSIS 写入分析结果并进入 results | ✅ PASS |
| LOAD_HISTORY 回放历史记录进入 results | ✅ PASS |
| 【核心】默认阈值 0.50 时可见 7 种（2 种被隐藏：灰喜鹊/戴胜） | ✅ PASS |
| 【核心】阈值调到 0.30：全部 9 种显示 | ✅ PASS |
| 【核心】阈值调到 0.90：仅 1 种显示（隐藏更多物种） | ✅ PASS |
| 【核心】阈值超过最高置信度 0.94：0 种显示（空态） | ✅ PASS |
| 【核心】边界：conf 恰好等于阈值时保留（>= 语义：0.55→7 / 0.56→6 / 0.42→9 / 0.43→8 / 0.93→1） | ✅ PASS |
| 【核心】SET_THRESHOLD 不修改其他状态字段（纯函数） | ✅ PASS |
| SET_HIGHPASS / SET_REALTIME | ✅ PASS |
| TOAST 设置 / TOAST_CLEAR 清空 | ✅ PASS |

### 3.2 tests/mockData.test.js — 数据与工具函数（8 组 22 用例）

| 用例 | 状态 |
|---|---|
| SPECIES：共 9 个物种，id 唯一 | ✅ PASS |
| SPECIES：每个物种包含 id/name/latin/conf/freq/period 全部字段 | ✅ PASS |
| SPECIES：恰好 2 个物种低于 0.50 阈值 | ✅ PASS |
| SPECIES：至少 1 个物种置信度 ≥ 0.90 | ✅ PASS |
| SPECIES：所有物种置信度 ≥ 0.30 | ✅ PASS |
| INDICES：共 4 个指数（ACI/NDSI/ADI/H），key 唯一 | ✅ PASS |
| INDICES：每个指数包含 key/name/display/pct/desc | ✅ PASS |
| LIVABILITY：包含 score/grade/gradeEn/bio/sound/noise | ✅ PASS |
| LIVABILITY：score=68 与 gradeOf 一致（一般/Moderate） | ✅ PASS |
| HEATMAP：4 行 × 12 列，值均在 [0,1] | ✅ PASS |
| MAP_POINTS：每个样点包含 x/y/c/t，c 为合法十六进制颜色 | ✅ PASS |
| SUGGESTIONS：非空字符串数组 | ✅ PASS |
| HISTORY：3 条记录，字段完整且 id 唯一 | ✅ PASS |
| buildAnalysis：默认输出包含全部 8 个顶层字段 | ✅ PASS |
| **buildAnalysis：overrides.livability 与默认 LIVABILITY 合并** | ❌ **FAIL（源码 Bug，见 §4）** |
| buildAnalysis：顶层 overrides 可覆盖 speciesCount 与 recording | ✅ PASS |
| analysisForHistory：使用记录名称作为 recording，species 作为 speciesCount | ✅ PASS |
| gradeOf：score≥70 为 Good（宜居） | ✅ PASS |
| gradeOf：70>score≥50 为 Moderate（一般） | ✅ PASS |
| gradeOf：score<50 为 Stressed（受压） | ✅ PASS |
| livabilityDesc：score≥70 提示"适合鸟类安居"，含噪声占比 | ✅ PASS |
| livabilityDesc：50≤score<70 提示"提升空间"，含噪声占比 | ✅ PASS |
| livabilityDesc：score<50 提示"优先降噪" | ✅ PASS |

### 3.3 tests/dataContract.test.js — 数据契约（5 组 9 用例）

| 用例 | 状态 |
|---|---|
| src 中直接引用的 analysis.* 字段均存在于 buildAnalysis 输出 | ✅ PASS |
| 别名引用字段（a.recording/heatmap/mapPoints/suggestions/speciesCount/livability）均存在 | ✅ PASS |
| analysis.livability 子字段（score/bio/sound/noise）均存在 | ✅ PASS |
| SpeciesScreen 使用的 s.id/name/latin/conf/freq/period 均存在 | ✅ PASS |
| IndicesScreen 使用的 key/name/display/pct/desc 均存在 | ✅ PASS |
| HomeScreen 历史记录使用的 id/name/species/score/duration 均存在 | ✅ PASS |
| LIVABILITY 含 grade/gradeEn 展示字段 | ✅ PASS |
| 各屏幕 from mockData 的具名导入均真实存在 | ✅ PASS |
| SettingsScreen 滑杆范围 0.30–0.90、步进 0.01 一致 | ✅ PASS |
| 物种清单 0.30/0.50/0.90 阈值可见数符合 PRD（9/7/1） | ✅ PASS |
| 物种清单各时段计数与总数自洽（阈值 0.50） | ✅ PASS |

**汇总：52 用例 → 51 PASS / 1 FAIL**

---

## 4. 智能路由判定：**→ Engineer（源码存在 Bug）**

### 失败用例
- `tests/mockData.test.js` → 「overrides.livability 与默认 LIVABILITY 合并」（约第 155 行）

### 期望行为 vs 实际行为
- **期望**：`buildAnalysis('x.wav', { livability: { score: 82, noise: 22 } })` 返回 `livability: { score: 82, noise: 22, bio: 76, sound: 60, grade: '一般', gradeEn: 'Moderate' }` —— 即 livability 覆盖项与默认值**合并**（函数文档 `@param overrides 可覆盖 { speciesCount, livability:{...}, recording }` 以及源码第 79 行 `livability: { ...LIVABILITY, ...(overrides.livability || {}) }` 均表明该意图）。
- **实际**：返回 `livability: { score: 82, noise: 22 }` —— 默认字段 `bio`、`sound`、`grade`、`gradeEn` **全部丢失**。

### 根因与位置
- 文件：`frontend/src/data/mockData.js`，函数 `buildAnalysis`（第 74–87 行）
- 关键行：**第 84 行 `...overrides,`** 位于第 79 行 livability 合并之后，顶层展开将 `overrides.livability` **整体替换**掉已合并的 livability 对象，导致第 79 行的合并逻辑成为死代码。
- 建议修复方向（供 Engineer 参考，QA 未改动源码）：将 `...overrides` 移到 `livability` 键之前，或单独展开，例如：
  ```js
  const merged = {
    recording: name,
    species: SPECIES,
    indices: INDICES,
    heatmap: HEATMAP,
    mapPoints: MAP_POINTS,
    suggestions: SUGGESTIONS,
    speciesCount: SPECIES.length,
    ...overrides,
    livability: { ...LIVABILITY, ...(overrides.livability || {}) },
  };
  ```

### 影响面评估
- **当前用户可见影响：低（潜在）**。经全库检索，`analysis.livability.grade / gradeEn` 未被任何屏幕直接读取（Results/Livability 屏幕均通过 `gradeOf(score)` 动态重算），且现有调用方（initialState、AnalyzingScreen、analysisForHistory）都显式传入 score/noise/bio/sound，因此 4 个数字字段在真实路径中不会缺失。
- **风险**：任何后续依赖 `analysis.livability.bio/sound/grade/gradeEn` 的消费方（或复用 `buildAnalysis` 且只覆盖部分字段）都会拿到 `undefined`；且第 79 行合并意图与最终行为自相矛盾，属于明确的业务逻辑缺陷，建议修复。

---

## 5. 遗留问题清单（观察项，非阻断）

1. **（低）演示数据自洽性**：`HISTORY[2]`（西郊森林公园_黄昏.wav）声明 `species: 12`，但 `analysisForHistory` 生成的 `analysis.species` 始终为静态 `SPECIES`（9 种）→ 结果页显示 12 种、物种清单仅 9 行，数量不一致。属演示数据局限，非代码缺陷，建议后续接入真实数据时以 speciesCount 截断或扩充。
2. **（低）SET_THRESHOLD 无范围钳制**：reducer 对阈值不做 [0.30, 0.90] 钳制，越界值会原样写入 state。当前 UI 滑杆已约束输入，暂不构成缺陷；若未来有外部写入，建议在 reducer 中 clamp。
3. **（清理）遗留文件**：`frontend/qa_store_entry.jsx` 为上一轮中断 QA 会话遗留的临时入口（含 `module.exports` 与 ESM 混用、路径引用失效、未被任何文件引用），建议删除，避免混淆。

---

## 6. 结论

- 构建：✅ 通过
- 测试：51/52 通过，1 项失败（`buildAnalysis` livability 合并缺陷，判定为**源码 Bug**）
- **智能路由判定：Engineer** —— 请修复 `frontend/src/data/mockData.js` 第 74–87 行 `buildAnalysis` 的展开顺序问题后，QA 将执行 Round 2 回归验证。
