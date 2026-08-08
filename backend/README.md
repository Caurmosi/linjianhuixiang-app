# 《林间回响》后端服务

城市绿地鸟类宜居度诊断 App 的**后端服务**：接收前端上传的音频（wav / mp3 / webm…），
完成 **BirdNET 鸟声识别 → 声学指数（ACI / NDSI / ADI / H）→ 人为噪声占比 → 宜居度评分**，
并对外提供与前端 `apiService.js` / `mockData.js` **完全一致**的 REST 契约。

```
backend/
├── app/
│   ├── main.py              # FastAPI 入口（CORS / 异常处理 / 路由挂载）
│   ├── config.py            # 全部可配置项（环境变量覆盖）
│   ├── api/
│   │   ├── routes.py        # 全部 REST 接口
│   │   └── schemas.py       # Pydantic 响应模型（数据契约）
│   ├── core/
│   │   ├── audio.py         # 解码（soundfile + ffmpeg）/ 48kHz 16bit 预处理 / 降噪
│   │   ├── dsp.py           # mel 滤波器组 / STFT / 滤波 / 归一化（无 librosa 依赖）
│   │   ├── birdnet.py       # BirdNET TFLite 引擎 + 启发式兜底引擎
│   │   ├── indices.py       # ACI / NDSI / ADI / H
│   │   ├── noise.py         # 人为噪声占比估算
│   │   ├── livability.py    # 生物多样性 × 声环境质量 → 0-100 分 + 等级
│   │   ├── synthesis.py     # 热力图 / 空间样点 / 多绿地 / 提升建议
│   │   ├── baseline.py      # 演示基准数据（= 前端 mockData.js）
│   │   └── synth.py         # 测试信号合成（sample_bird / sample_traffic）
│   └── db/database.py       # SQLite（history + 最近一次分析）
├── models/                  # BirdNET 模型文件（gitignore，脚本下载）
├── scripts/                 # 下载模型 / 生成样例 / 灌演示数据
├── tests/                   # 契约测试 / 指数数值测试 / API 行为测试
├── requirements.txt         # 基础依赖（Windows/macOS/Linux 均可装）
├── requirements-birdnet.txt # tflite-runtime（仅 Linux，Docker 用）
├── Dockerfile
└── README.md
```

---

## 接口契约（与前端完全一致）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 服务状态（引擎 / 模型 / 数据库 / 运行时长） |
| GET | `/api/species` | 物种清单 `[{id, name, latin, conf, freq, period}]` |
| GET | `/api/indices` | 声学指数 `[{key: ACI\|NDSI\|ADI\|H, name, display, pct, desc}]` |
| GET | `/api/livability` | 宜居度 `{score, grade, gradeEn, bio, sound, noise}` |
| GET | `/api/heatmap` | 4×12 二维数组（0–1 强度） |
| GET | `/api/map-points` | 空间样点 `[{x, y, c, t}]` |
| GET | `/api/green-spaces` | 多绿地对比 `[{name, points: [...]}]` |
| GET | `/api/suggestions` | 提升建议字符串数组 |
| GET | `/api/history` | 历史记录 `[{id, name, species, score, duration, noise, bio, sound}]` |
| POST | `/api/analyze` | multipart 上传音频，返回完整分析结果 |

> GET 数据端点在没有分析记录时返回内置基准数据（与前端 mock 一致）；
> 每次 `POST /api/analyze` 后会持久化为"最近一次分析"，GET 端点随即返回真实分析结果。

### POST /api/analyze 请求

```
multipart/form-data
  file:      音频文件（wav/mp3/webm/m4a/ogg/flac/aac，≤30MB，1s–10min）
  threshold: 置信度阈值（可选，默认 0.5）
  highpass:  是否高通滤波降噪（可选，默认 true）
  max_species: 最多返回物种数（可选，默认 10）
```

响应：

```jsonc
{
  "recording": "中山公园_晨.wav",
  "species": [{ "id": 1, "name": "白头鹎", "latin": "Pycnonotus sinensis", "conf": 0.93, "freq": 21, "period": "清晨" }],
  "indices": [{ "key": "ACI", "name": "声学复杂度指数", "display": "82.4", "pct": 82, "desc": "…" }],
  "livability": { "score": 68, "grade": "一般", "gradeEn": "Moderate", "bio": 76, "sound": 60, "noise": 34 },
  "heatmap": [[0.2, 0.3, …], …],            // 4×12
  "mapPoints": [{ "x": 70, "y": 55, "c": "#2e7d52", "t": "宜居" }],
  "suggestions": ["控制晨练音响音量…"],
  "speciesCount": 9,
  "engine": "heuristic",                     // birdnet | heuristic（附加字段）
  "durationSec": 20.0
}
```

---

## 本地启动

要求：**Python ≥ 3.10**；mp3/webm/m4a 解码需要系统安装 **ffmpeg**（wav 不需要）。

```bash
cd backend

# 1) 创建虚拟环境并安装依赖
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt

# 2) 生成测试音频（可选：端到端验证用）
python scripts/generate_sample.py

# 3) 启动
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

验证：

```bash
curl http://localhost:8000/health
curl http://localhost:8000/api/species

# 端到端：用一段鸟鸣音频分析
curl -F "file=@assets/sample_bird.wav" http://localhost:8000/api/analyze

# 真实录音（官方 BirdNET 示例声景，约 11MB；启发式引擎即可跑通）
curl -sL -o assets/real_soundscape.wav \
  "https://raw.githubusercontent.com/birdnet-team/BirdNET-Analyzer/main/birdnet_analyzer/example/soundscape.wav"
curl -F "file=@assets/real_soundscape.wav" http://localhost:8000/api/analyze
```

浏览器打开 `http://localhost:8000/docs` 查看交互式 API 文档（Swagger UI）。

### 启用真实 BirdNET（可选，推荐）

默认 `auto` 模式：检测到 `models/` 下有模型文件即用 BirdNET，否则用内置启发式引擎（开箱即用，精度有限）。
V2.4 模型输入为**原始 3 秒音频波形**（48kHz/144000 样本），推理实现与官方 BirdNET-Analyzer 对齐。

```bash
# 安装推理运行时（Windows/macOS/Linux 均可；不装则自动降级启发式）
pip install -r requirements-birdnet.txt   # ai-edge-litert

# 下载官方模型 + 中文标签（约 53MB，Zenodo 官方记录）
python scripts/download_birdnet_model.py

# 重启服务，/health 中 engine 变为 birdnet、modelLoaded 变为 true
```

> 本仓库开发时已用真实模型验证：`/health` 显示 `engine=birdnet, modelLoaded=true, labelsCount=6522`，
> 官方示例声景（120s）识别出 红翅凤头鹃 / 黑顶山雀 / 暗眼灯草鹀。

### 灌入演示历史（可选）

```bash
python scripts/seed_demo.py   # 写入与前端 mock 一致的 3 条历史记录
```

---

## Docker 部署

```bash
cd backend

# 构建（不下载模型：镜像小，自动走启发式引擎）
docker build -t linjianhuixiang-backend .

# 构建并内置真实 BirdNET 模型（镜像增大约 170MB）
docker build --build-arg DOWNLOAD_MODEL=true -t linjianhuixiang-backend .

# 运行（挂载卷持久化 SQLite）
docker run -d --name ljx-backend \
  -p 8000:8000 \
  -v ljx-data:/app/data \
  linjianhuixiang-backend

# 验证
curl http://localhost:8000/health
curl -F "file=@assets/sample_bird.wav" http://localhost:8000/api/analyze
```

云容器平台（如腾讯云/阿里云/华为云容器服务、K8s）直接把镜像推送到镜像仓库后部署即可；
挂载持久卷到 `/app/data`（SQLite 数据库所在目录）。

---

## 前端接入

前端在 `linjianhuixiang-app/frontend`，数据访问层已预留给真实 API：

```bash
cd linjianhuixiang-app/frontend
npm install

# 真实数据模式：先启动后端，再启动前端（Vite 已配置 /api 代理到 8000）
VITE_USE_MOCK=false npm run dev
```

`frontend/src/services/apiService.js` 已实现为**同步 XHR**（保持"UI 零改动"的一键切换）；
如需生产化，可平滑改为 `fetch + async`（消费侧按前端 README「数据源切换」小节改造）。

---

## 测试

```bash
cd backend
pip install -r requirements-dev.txt
pytest -q

# 契约测试（对应前端 tests/dataContract.test.js 守护的字段集）
pytest tests/test_contract.py -q
```

覆盖：接口字段契约、热力图维度/量程、地图样点字段、鸟鸣 vs 交通场景区分、
错误路径（空文件 / 非法格式 / 超限）、历史持久化、`/health`。

---

## 引擎与算法说明

| 模块 | 算法 | 说明 |
| --- | --- | --- |
| 鸟声识别 | BirdNET GLOBAL 6K V2.4（TFLite） | 官方预训练模型，输入原始 3s 波形（144000 样本）→ 6522 类 logits → flat_sigmoid；缺失时降级为启发式（2–8kHz 调性音节 × 频段画像匹配） |
| ACI | Pieretti et al. 2011（dB 域） | 相邻帧 dB 差 / 平移后 dB 和，按频点聚合取均值 |
| NDSI | Kasten et al. 2012 | (生物声带 2–11kHz − 人为声带 1–2kHz) / 二者之和 |
| ADI | Villanueva-Rivera et al. 2011 | 10 频带 Shannon 熵（−50dB 门限）归一化 |
| H | Sueur et al. 2008 | 时间熵 × 频谱熵 |
| 噪声占比 | 频谱比 + 鸟声活动融合 | `0.65 × 1–2kHz占比 + 0.35 × (1 − 活动)` |
| 宜居度 | 加权融合 | `score = 0.55 × bio + 0.45 × sound`；≥70 宜居 / ≥50 一般 / <50 受压 |

> 启发式引擎用于开发/演示/离线兜底，**正式评估请下载官方 BirdNET 模型**。
> 合成样例音频（`assets/sample_bird.wav`）仅用于管线验证，正式评估请使用真实录音。
