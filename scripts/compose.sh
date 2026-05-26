#!/usr/bin/env bash
set -euo pipefail

docker_error=""
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    exec docker compose "$@"
  fi
  docker_error="Docker CLI was found, but the Docker daemon is not reachable. Start Docker Desktop, or use pnpm compose:infra:podman if Podman is installed."
fi

if command -v docker-compose >/dev/null 2>&1 && docker-compose version >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    exec docker-compose "$@"
  fi
  docker_error="${docker_error:-Docker Compose was found, but the Docker daemon is not reachable. Start Docker Desktop, or use pnpm compose:infra:podman if Podman is installed.}"
fi

if command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  exec podman compose "$@"
fi

if [ -n "$docker_error" ]; then
  printf '%s\n\n' "$docker_error" >&2
fi

cat >&2 <<'EOF'
No supported Compose command was found.

Install one of:
  - Docker Desktop with `docker compose`
  - legacy `docker-compose`
  - Podman with `podman compose`
EOF
exit 1
