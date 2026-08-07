# QA 回归验证报告 — 数据访问层（repository）改造

- **验证人**：Edward（QA Engineer）
- **验证方式**：独立实测（新鲜视角，不轻信工程师自述）
- **项目**：`linjianhuixiang-app/frontend`（Vite + React 18 纯 JSX）
- **验证日期**：2025-08-07
- **路由判定**：**NoOne（无需返工）** —— 全部 7 项验证通过，108/108 测试通过，0 缺陷

---

## 一、路由判定

| 判定 | 理由 |
| --- | --- |
| **NoOne** | 构建 exit 0；全量测试 108 pass / 0 fail；隔离验证零命中；repository ↔ apiService 接口一一对应且语义一致；开关逻辑正确；调用方全部走 repository；冒烟 200。无源码缺陷、无测试断言缺陷，无需返工。 |

---

## 二、逐项验证结果

### 1. 构建 ✅
```bash
npm run build
# vite v5.4.21 building for production...
# ✓ 60 modules transformed.
# dist/index.html                   1.00 kB │ gzip:  0.66 kB
# dist/assets/index-QjmigDap.css   24.30 kB │ gzip:  5.73 kB
# dist/assets/index-BLsM7duj.js   177.95 kB │ gzip: 58.72 kB
# ✓ built in 1.59s
# BUILD_EXIT_CODE=0
```
**结论**：exit 0，构建通过。

### 2. 全量测试 ✅
```bash
node --test tests/*.test.mjs tests/*.test.js
# 1..74
# tests 108
# suites 20
# pass 108
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 468.1129
# TEST_EXIT_CODE=0
```
**结论**：**108 pass / 0 fail**，与预期完全一致。其中 `tests/repository.test.mjs`（9 用例，含子进程端到端开关验证）全部通过。

### 3. 隔离验证（UI 不再直接依赖 mock 数据源）✅
```bash
grep -rn "data/mockData" src/ --include="*.jsx" --include="*.js"
# （无任何输出）
# GREP_EXIT_CODE=1  ← grep 无匹配，即零命中
```
补充全量 `mockData` 扫描：`src/` 下仅 `repository.js` 内部 `import * as mockData from './mockData.js'`（数据层内部，符合设计），其余均为注释提及；**所有 UI/store/utils 均无直接 import mockData**。

### 4. 数据层契约 ✅
- **repository 导出的数据接口（12 个）**：`getSpeciesList / getIndices / getLivability / getHeatmap / getMapPoints / getGreenSpaces / getSuggestions / getHistory / buildAnalysis / analysisForHistory / gradeOf / livabilityDesc`
- **apiService 导出的函数（12 个）**：与 repository 完全一致，**一一对应，无缺失、无多余**（额外 re-export 的 `dataSource/getDataSource/isMock/isMockMode/DATA_SOURCE` 为 dataConfig 调试辅助，非数据接口，属设计内）。
- **抽查语义一致性**（实测输出）：
  - `getSpeciesList()`：repo 返回 9 项，与 `mockData.SPECIES` **同一引用**（纯转发）✅
  - `buildAnalysis('中山公园_晨.wav', {speciesCount:9})`：recording / speciesCount / livability.score 与 mockData 全一致 ✅
  - `gradeOf(82/50/49)`：`宜居/Good/good`、`一般/Moderate/mid`、`受压/Stressed/bad` 与 mockData 全一致 ✅

### 5. 开关逻辑 ✅（实测输出）
| 环境 | dataSource | 结果 |
| --- | --- | --- |
| 默认（无 VITE_USE_MOCK） | `mock` | ✅ |
| `VITE_USE_MOCK=true` | `mock` | ✅ |
| `VITE_USE_MOCK=FALSE`（大写） | `mock`（大小写敏感，仅小写 false 生效） | ✅ |
| `VITE_USE_MOCK=false` | `api`，且 repository 全部 12 个接口均路由到 apiService 抛「真实 API 未接入」 | ✅（预期行为） |

实测：`VITE_USE_MOCK=false node --input-type=module` 下 `dataSource='api' | isMockMode=false`，12 个接口逐一调用均抛 `真实 API 未接入：请实现 BirdNET/后端接口（<函数名>）`。

### 6. 调用方一致性 ✅
`src/` 下所有 `data/` 相关 import（实测 grep）：
- `store/appStore.jsx` → `import { buildAnalysis, getHistory } from '../data/repository'`
- `utils/exportReport.js` → `import { gradeOf } from '../data/repository'`
- `screens/AnalyzingScreen.jsx` → `buildAnalysis`
- `screens/HomeScreen.jsx` → `analysisForHistory`
- `screens/HistoryScreen.jsx` → `analysisForHistory`
- `screens/LivabilityScreen.jsx` → `gradeOf`
- `screens/MapScreen.jsx` → `getGreenSpaces`
- `screens/ResultsScreen.jsx` → `gradeOf, livabilityDesc`

**8 处调用全部来自 repository，零残留直接引用 mockData**。SpeciesScreen/IndicesScreen/SettingsScreen/MethodScreen/SampleScreen 通过 `useApp()` 消费 state，不直接触数据层，符合设计。

### 7. 回归冒烟 ✅
```bash
npm run dev   # VITE v5.4.21 ready；Port 5173 in use → 自动落到 5174
curl http://localhost:5174/                    → HTTP 200
curl http://localhost:5174/src/data/repository.js → HTTP 200（返回 repository 源码）
curl http://localhost:5174/src/config/dataConfig.js → HTTP 200
# 顺带验证了已占用的 5173（旧 dev server）也返回 200
```
**结论**：dev 服务器正常启动，`/` 与数据层模块均可访问。

---

## 三、遗留观察项（非阻塞，不影响路由判定）

1. **`npm test` 脚本未覆盖 `.mjs` 测试**（工具链缺口）
   - `package.json` 的 test 脚本为 `node --test "tests/**/*.test.js"`，glob 只匹配 `.test.js`。
   - 实测 `npm test` 仅运行 **54 个测试**（appStore.test.js / dataContract.test.js / mockData.test.js），而全量 `node --test tests/*.test.mjs tests/*.test.js` 为 **108 个**。
   - 即 `repository.test.mjs`（9 用例，本次改造核心验证）、`appStoreReducer.test.mjs`、`mockData.test.mjs`、`thresholdLinkage.test.mjs` 不会随 `npm test` 运行。
   - **建议**：将脚本改为 `node --test "tests/**/*.test.{js,mjs}"`（或 `node --test tests/`），并确认 Node ≥ 18 支持 glob。

2. **api 模式下应用启动即崩溃（fail-fast，与 README 描述一致）**
   - `appStore.jsx` 的 `initialState` 在模块加载时即调用 `getHistory()` 与 `buildAnalysis()`；在 `VITE_USE_MOCK=false` 下这两个调用立即抛「真实 API 未接入」。
   - 实测确认：api 模式加载 appStore 即抛错。这是**设计内行为**（README 明确说明「应用会抛出…错误 —— 这是预期行为，用于提示开发者完成接入」），默认 mock 演示完全不受影响。
   - 提示：真实接入 apiService 时需同步改造 initialState 的同步初始化（README 第 3 条已注明「真实接口为异步时…UI 消费侧按需 await」）。

3. **README 结构树有一处文件名漂移（文档小瑕疵）**
   - README 第 50 行写作 `store/appStore.js`，实际文件为 `store/appStore.jsx`（appStore.jsx 文件头注释也写的是 `appStore.js`）。不影响任何功能，仅建议顺手更正。

4. **端口占用**
   - 验证时 5173 已被先前遗留的 dev server 占用（PID 33112），Vite 自动回退 5174 并正常服务；无功能影响。

---

## 四、最终结论

数据访问层（repository）改造**验证通过**：默认 mock 行为零变化（同一引用转发、语义一致），开关逻辑正确，UI 已与 mock 数据源解耦，全量测试与构建均绿。
**路由：NoOne**，无需返工。建议按观察项 1 修正 npm test 脚本以覆盖 `.mjs` 用例。
