# 《林间回响》后端镜像
# 构建：docker build -t linjianhuixiang-backend .
# 运行：docker run -p 8000:8000 -v ljx-data:/app/data linjianhuixiang-backend
# 真实 BirdNET：构建时加 --build-arg DOWNLOAD_MODEL=true（镜像增大约 170MB）

FROM python:3.11-slim

# ffmpeg：mp3/webm/m4a 解码必需
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用构建缓存）
COPY requirements.txt requirements-birdnet.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-birdnet.txt

COPY app ./app
COPY scripts ./scripts

# 可选：构建时下载官方 BirdNET 模型（需外网，约 170MB）
# 容错：模型下载失败不阻断构建——服务自动降级启发式引擎（功能完整，仅识别精度较低）
ARG DOWNLOAD_MODEL=false
RUN if [ "$DOWNLOAD_MODEL" = "true" ]; then \
      python scripts/download_birdnet_model.py --dir /app/models \
      || echo "::warning::BirdNET 模型下载失败，镜像将使用启发式引擎（confidence/livability 功能不受影响）"; \
    fi

ENV LJX_DATA_DIR=/app/data \
    LJX_MODELS_DIR=/app/models \
    LJX_BIRDSNET_MODE=auto \
    PYTHONUNBUFFERED=1

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
