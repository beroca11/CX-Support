FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=ghcr.io/astral-sh/uv:latest /uvx /usr/local/bin/uvx

COPY pyproject.toml ./
COPY bridge ./bridge

RUN uv pip install --system .

ENV BRIDGE_PORT=8100
ENV CACHE_DIR=/data/cache
ENV WORKSPACE_MCP_CMD=uvx
ENV WORKSPACE_MCP_ARGS="--python 3.12 workspace-mcp --tool-tier core --single-user"
RUN mkdir -p /data/cache

EXPOSE 8100 8000

CMD ["uvicorn", "bridge.server:app", "--host", "0.0.0.0", "--port", "8100"]
