# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-build

WORKDIR /build/frontend

COPY \
    frontend/package.json \
    frontend/package-lock.json \
    ./

RUN npm ci

COPY frontend/ ./

RUN npm run build


FROM python:3.12-slim-bookworm AS runtime

ENV \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN \
    groupadd \
        --gid 10001 \
        app \
    && \
    useradd \
        --uid 10001 \
        --gid 10001 \
        --create-home \
        --shell /usr/sbin/nologin \
        app

COPY \
    backend/requirements.txt \
    ./backend/requirements.txt

RUN \
    pip install \
        --no-cache-dir \
        -r backend/requirements.txt

COPY \
    --chown=app:app \
    backend/ \
    ./backend/

COPY \
    --from=frontend-build \
    --chown=app:app \
    /build/frontend/dist \
    ./frontend/dist

USER app

EXPOSE 8080

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
