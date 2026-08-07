# 《林间回响》城市鸟类宜居度诊断 App

通过 **BirdNET 端侧识别鸟声**，耦合**人为噪声**评估"城市绿地鸟类宜居度"。
本仓库包含：

- `frontend/` —— React 18 + Vite + Tailwind CSS 的移动端 H5 前端（可独立运行，也可打包进 Android WebView）
- `android/` —— Android WebView 套壳工程（Kotlin），加载 `assets/index.html`

> 高保真静态原型：`../index.html`（参考设计系统与 8 屏布局，未改动）。

---

## 功能概览

| 模块 | 说明 |
| --- | --- |
| 首页 | 选择音频文件 / 一键演示（内置样例）/ 实时录音(P1) / 历史记录 / 最近分析 |
| 分析中 | 声波动画 + 5 步管线进度（音频导入→预处理→BirdNET→声学指数→宜居度），自动跳转结果 |
| 结果总览 | 宜居度环形大卡片（68 · 一般）+ 识别鸟种 9 + 人为噪声占比 34% + 4 个详情入口 |
| 物种清单 | 阈值 chip + 时段筛选（全部/清晨/上午/黄昏/全天）+ 置信度进度条，阈值实时生效 |
| 宜居度详情 | 双指标（生物多样性 76 / 声环境质量 60）+ 噪声-多样性耦合散点图 + 提升建议 |
| 声学指数 | ACI 82.4 / NDSI 0.41 / ADI 0.73 / H 0.85 |
| 声景地图 | 分段切换「时间热力图 / 空间分布」 |
| 我的（设置） | 置信度阈值滑杆（0.30-0.90）+ 高通滤波 / 实时录音开关 + 导出 / 方法学 / 样例管理 |

**核心联动**：在「我的 → 设置」调整置信度阈值，会实时影响「结果 → 物种清单」的显示（低于阈值的物种被隐藏）。

---

## 项目结构

```
linjianhuixiang-app/
├── README.md
├── frontend/                      # React H5 前端
│   ├── package.json
│   ├── vite.config.js             # base:'./'，适配 file:// 加载
│   ├── tailwind.config.js         # 设计系统 token（森林色板 / 字体）
│   ├── postcss.config.js
│   ├── index.html                 # 移动端 viewport + Google Fonts
│   ├── public/favicon.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx                # 屏幕路由 + 底部导航 + Toast
│       ├── index.css              # Tailwind + 全部组件样式
│       ├── config/dataConfig.js   # 真假数据源开关（mock / api，VITE_USE_MOCK 切换）
│       ├── data/mockData.js       # 演示数据（物种/指数/宜居度/热力图/地图/历史）
│       ├── data/repository.js     # 统一数据访问层（全应用唯一数据出口）
│       ├── services/apiService.js # 真实 API 骨架（BirdNET/后端接入口，待实现）
│       ├── store/appStore.js      # Context 全局状态（结果共享 / 阈值 / 开关）
│       ├── components/
│       │   ├── StatusBar.jsx  BottomNav.jsx  AppBar.jsx  Ring.jsx  icons.jsx
│       │   ├── charts/  ScatterChart.jsx  HeatmapChart.jsx  MapChart.jsx
│       │   └── ui/      Chip.jsx  Button.jsx  Bar.jsx  Toggle.jsx
│       └── screens/     HomeScreen  AnalyzingScreen  ResultsScreen  SpeciesScreen
│                        LivabilityScreen  IndicesScreen  MapScreen  SettingsScreen  MethodScreen
└── android/                       # Android WebView 套壳（Kotlin）
    ├── settings.gradle / build.gradle / gradle.properties
    └── app/
        ├── build.gradle / proguard-rules.pro
        └── src/main/
            ├── AndroidManifest.xml
            ├── java/com/linjianhuixiang/app/
            │   ├── MainActivity.kt          # WebView 加载 assets/index.html
            │   └── WebAppInterface.kt       # JS 桥（window.AndroidBridge）
            ├── assets/index.html            # ⚠️ 由 frontend 构建产物复制而来
            └── res/  values(colors/themes/strings) + drawable/ic_launcher.xml
```

---

## 前端启动（frontend/）

要求：Node.js ≥ 18。

```bash
cd frontend
npm install          # 安装依赖
npm run dev          # 本地开发，默认 http://localhost:5173
npm run build        # 构建到 dist/（相对路径，可 file:// 加载）
npm run preview      # 预览构建产物
```

桌面浏览器打开时显示为**居中手机画布**（最大宽度 430px）；真机窄屏（≤480px）自动全屏沉浸。

---

## 数据源切换（mock ↔ 真实 API）

前端通过**统一数据访问层** `src/data/repository.js` 获取数据，UI / store / utils 不直接依赖 mockData，
因此切换数据源时**界面代码零改动**。

- **默认（mock 演示数据）**：不设置环境变量，或 `VITE_USE_MOCK=true`。

  ```bash
  npm run dev
  ```

- **切换到真实 API 模式**：

  ```bash
  VITE_USE_MOCK=false npm run dev
  ```

  此时 `repository.js` 会改用 `src/services/apiService.js`。由于 BirdNET / 后端接口尚未接入，
  应用会抛出「真实 API 未接入」错误 —— 这是**预期行为**，用于提示开发者完成接入。

**如何接入 BirdNET / 后端**：

1. 在 `src/services/apiService.js` 中按 repository 同款接口逐个实现：
   `getSpeciesList / getIndices / getLivability / getHeatmap / getMapPoints /
   getGreenSpaces / getSuggestions / getHistory / buildAnalysis / analysisForHistory /
   gradeOf / livabilityDesc`，将 `throw` 占位替换为 fetch/axios 请求；
2. 返回数据结构必须与 `src/data/mockData.js` 保持一致（字段契约由 `tests/dataContract.test.js` 守护）；
3. 真实接口为异步时改为 `async` 函数（返回 Promise），并在 UI 消费侧按需 `await`
   （当前 UI 为同步消费，真实接入阶段再统一改造）；
4. 切回 mock：`VITE_USE_MOCK=true npm run dev`，或直接删除环境变量。

> 调试辅助：`repository.getDataSource()` / `isMockMode()` / `isMock()` 返回当前数据源类型，
> 供开发调试与测试断言使用。

---

## Android 打包部署步骤

1. **构建 H5 产物**：

   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **将构建产物复制到 Android assets**（构建成功后才执行）：

   ```bash
   # Windows (PowerShell)
   Copy-Item -Recurse -Force frontend/dist/* android/app/src/main/assets/

   # macOS / Linux
   cp -r frontend/dist/* android/app/src/main/assets/
   ```

   > `assets/index.html` 就是 `frontend/dist/index.html`，其余 `assets/` 下的 `assets/` 子目录为 JS/CSS 资源。

3. **用 Android Studio 打开 `android/` 目录**（或命令行）：

   ```bash
   cd android
   ./gradlew assembleDebug        # 生成 app-debug.apk
   ```

4. 安装到手机：`adb install app/build/outputs/apk/debug/app-debug.apk`，或直接运行 Android Studio 的 Run。

> 说明：MainActivity 以 `file:///android_asset/index.html` 加载 H5，已启用 JavaScript、DOM Storage，允许 file 访问，并注册 `window.AndroidBridge` JS 桥（预留，P1 扩展导出/录音/权限等原生能力）。字体通过 Google Fonts 在线加载，离线时自动回退系统字体（PingFang SC / 微软雅黑）。

---

## 设计系统（摘要）

- **色板**：主色 `forest-600 #1F5A3F`；纸白 `#F5F2EA`；暖色 `sun #E09A2E`；陶土 `clay #C25A39`；宜居度三级 宜居绿 / 一般琥珀 / 受压陶土。
- **字体**：展示 `Fraunces`；正文 `Manrope + PingFang SC/微软雅黑`；数字 `Space Grotesk`。
- **风格**：森林有机风、20px 圆角卡片、柔和阴影、呼吸感间距。

## 已知边界（P1）

- 实时录音、历史记录完整列表、报告导出、样例音频管理为 P1 增强，UI 中已提示"开发中"。
- 分析流程为**演示模拟**（内置 mock 数据），BirdNET 端侧推理与 Chaquopy 集成留待原生阶段接入。
- 当前数据为演示样例（公开数据集验证思路），正式发布前需以实地录音校准阈值。
