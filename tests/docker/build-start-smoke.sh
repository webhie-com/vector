#!/bin/sh
set -eu

WORKDIR="$(pwd)"
BAKED_CONFIG_PATH="${WORKDIR}/tests/docker/.tmp.baked.config.ts"
ALT_CONFIG_PATH="${WORKDIR}/tests/docker/.tmp.alt.config.ts"
ROUTES_DIR="${WORKDIR}/examples/routes"
ROUTES_BACKUP="${WORKDIR}/examples/routes.__docker_smoke_backup"
CUSTOM_BUILD_DIR="${WORKDIR}/dist/custom"
CUSTOM_BUILD_SERVER="${CUSTOM_BUILD_DIR}/server.js"
ORPHAN_BUILD_DIR="${WORKDIR}/dist/orphan"
ORPHAN_BUILD_SERVER="${ORPHAN_BUILD_DIR}/server.js"
MISSING_BUILD_PATH="${WORKDIR}/dist/custom-missing"

if [ -n "${VECTOR_MATRIX_BASE_PORT:-}" ]; then
  BASE_PORT="${VECTOR_MATRIX_BASE_PORT}"
else
  BASE_PORT="$(( ($(date +%s) % 20000) + 20000 ))"
fi
BAKED_PORT=0
ALT_PORT=0
SERVER_OVERRIDE_PORT=0
CLI_OVERRIDE_PORT=0
CLI_PATH_OVERRIDE_PORT=0

ACTIVE_PID=""

cleanup() {
  if [ -n "${ACTIVE_PID}" ]; then
    kill "${ACTIVE_PID}" >/dev/null 2>&1 || true
    wait "${ACTIVE_PID}" >/dev/null 2>&1 || true
  fi

  if [ -d "${ROUTES_BACKUP}" ] && [ ! -d "${ROUTES_DIR}" ]; then
    mv "${ROUTES_BACKUP}" "${ROUTES_DIR}"
  fi

  rm -f "${BAKED_CONFIG_PATH}" "${ALT_CONFIG_PATH}"
  rm -rf "${CUSTOM_BUILD_DIR}"
  rm -rf "${ORPHAN_BUILD_DIR}"
}

trap cleanup EXIT INT TERM

is_port_in_use() {
  target_port="$1"
  lsof -iTCP:"${target_port}" -sTCP:LISTEN -n -P >/dev/null 2>&1
}

select_ports() {
  candidate="$1"

  while is_port_in_use "${candidate}" \
    || is_port_in_use "$((candidate + 1))" \
    || is_port_in_use "$((candidate + 2))" \
    || is_port_in_use "$((candidate + 4))" \
    || is_port_in_use "$((candidate + 6))"; do
    candidate="$((candidate + 20))"
  done

  BAKED_PORT="${candidate}"
  ALT_PORT="$((candidate + 2))"
  SERVER_OVERRIDE_PORT="$((candidate + 1))"
  CLI_OVERRIDE_PORT="$((candidate + 4))"
  CLI_PATH_OVERRIDE_PORT="$((candidate + 6))"
}

write_config() {
  target_path="$1"
  target_port="$2"

  cat >"${target_path}" <<EOF
export default {
  port: ${target_port},
  hostname: '127.0.0.1',
  development: false,
  routesDir: './examples/routes',
  defaults: {
    route: {
      expose: true,
      auth: false,
    },
  },
  openapi: {
    enabled: false,
  },
};
EOF
}

wait_for_health() {
  target_port="$1"
  log_path="$2"
  health_path="$3"

  ready=0
  for _ in $(seq 1 80); do
    if curl -sf "http://127.0.0.1:${target_port}/health" >"${health_path}"; then
      ready=1
      break
    fi
    sleep 0.25
  done

  if [ "${ready}" -ne 1 ]; then
    echo "ERROR: server did not become ready on port ${target_port}"
    tail -n 200 "${log_path}" || true
    return 1
  fi

  jq -e '.status == "healthy" and .service == "vector-example-api"' "${health_path}" >/dev/null
}

run_case() {
  case_name="$1"
  expected_port="$2"
  shift 2

  log_path="/tmp/vector-${case_name}.log"
  health_path="/tmp/vector-${case_name}-health.json"

  echo "==> Case: ${case_name}"
  bun run "$@" >"${log_path}" 2>&1 &
  ACTIVE_PID=$!

  wait_for_health "${expected_port}" "${log_path}" "${health_path}"

  curl -sf "http://127.0.0.1:${expected_port}/events?city=Austin&page=2" >"/tmp/vector-${case_name}-events.json"
  jq -e '.city == "Austin" and .page == 2 and (.events | length) > 0' "/tmp/vector-${case_name}-events.json" >/dev/null

  kill "${ACTIVE_PID}" >/dev/null 2>&1 || true
  wait "${ACTIVE_PID}" >/dev/null 2>&1 || true
  ACTIVE_PID=""
}

run_expected_failure_case() {
  case_name="$1"
  expected_pattern="$2"
  shift 2

  log_path="/tmp/vector-${case_name}.log"

  echo "==> Case: ${case_name} (expected failure)"
  if bun run "$@" >"${log_path}" 2>&1; then
    echo "ERROR: expected failure but command succeeded"
    return 1
  fi

  if ! grep -q "${expected_pattern}" "${log_path}"; then
    echo "ERROR: expected pattern '${expected_pattern}' not found in failure output"
    cat "${log_path}" || true
    return 1
  fi
}

echo "==> Preparing test configs..."
select_ports "${BASE_PORT}"
echo "==> Selected test ports starting at ${BAKED_PORT}"
write_config "${BAKED_CONFIG_PATH}" "${BAKED_PORT}"
write_config "${ALT_CONFIG_PATH}" "${ALT_PORT}"

run_expected_failure_case \
  "build-config-missing" \
  "Config file not found" \
  src/cli/index.ts build --config "${WORKDIR}/tests/docker/.missing.config.ts"
run_expected_failure_case \
  "build-routes-missing" \
  "Routes directory not found" \
  src/cli/index.ts build --routes "${WORKDIR}/tests/docker/.missing.routes"
run_expected_failure_case \
  "build-path-overlap-routes" \
  "Build output overlaps source routes" \
  src/cli/index.ts build --routes "${ROUTES_DIR}" --path "${ROUTES_DIR}"

echo "==> Building app (bakes config into dist/server.js + compiles dist/routes)..."
bun run src/cli/index.ts build --config "${BAKED_CONFIG_PATH}"

if [ ! -f "${WORKDIR}/dist/server.js" ]; then
  echo "ERROR: dist/server.js was not generated"
  exit 1
fi

if [ ! -d "${WORKDIR}/dist/routes" ]; then
  echo "ERROR: dist/routes was not generated"
  exit 1
fi

echo "==> Building app to custom path via --path..."
bun run src/cli/index.ts build --config "${ALT_CONFIG_PATH}" --routes "${ROUTES_DIR}" --path "${CUSTOM_BUILD_DIR}"

if [ ! -f "${CUSTOM_BUILD_SERVER}" ]; then
  echo "ERROR: ${CUSTOM_BUILD_SERVER} was not generated"
  exit 1
fi

if [ ! -d "${CUSTOM_BUILD_DIR}/routes" ]; then
  echo "ERROR: ${CUSTOM_BUILD_DIR}/routes was not generated"
  exit 1
fi

rm -rf "${ORPHAN_BUILD_DIR}"
mkdir -p "${ORPHAN_BUILD_DIR}"
cp "${CUSTOM_BUILD_SERVER}" "${ORPHAN_BUILD_SERVER}"

echo "==> Building CLI executable for vector-start parity..."
bun build src/cli/index.ts --target bun --outfile dist/cli.js >/tmp/vector-cli-build.log

if [ ! -f "${WORKDIR}/dist/cli.js" ]; then
  echo "ERROR: dist/cli.js was not generated"
  exit 1
fi

echo "==> Removing source routes to prove built start uses dist/routes..."
if [ -d "${ROUTES_BACKUP}" ]; then
  rm -rf "${ROUTES_BACKUP}"
fi
if [ -d "${ROUTES_DIR}" ]; then
  mv "${ROUTES_DIR}" "${ROUTES_BACKUP}"
fi

run_case "server-baked-default" "${BAKED_PORT}" ./dist/server.js
run_case "server-port-override" "${SERVER_OVERRIDE_PORT}" ./dist/server.js --port "${SERVER_OVERRIDE_PORT}"
run_case "server-custom-direct" "${ALT_PORT}" ./dist/custom/server.js

run_case "cli-start-baked-default" "${BAKED_PORT}" ./dist/cli.js start
run_case "cli-start-port-override" "${CLI_OVERRIDE_PORT}" ./dist/cli.js start --port "${CLI_OVERRIDE_PORT}"
run_case "cli-start-build-path-dir" "${ALT_PORT}" ./dist/cli.js start --path "${CUSTOM_BUILD_DIR}"
run_case \
  "cli-start-build-path-dir-port-override" \
  "${CLI_PATH_OVERRIDE_PORT}" \
  ./dist/cli.js \
  start \
  --path "${CUSTOM_BUILD_DIR}" \
  --port "${CLI_PATH_OVERRIDE_PORT}"
run_case "cli-start-build-path-file" "${ALT_PORT}" ./dist/cli.js start --path "${CUSTOM_BUILD_SERVER}"
run_expected_failure_case \
  "cli-start-build-path-missing" \
  "Build path not found" \
  ./dist/cli.js start --path "${MISSING_BUILD_PATH}"
run_expected_failure_case \
  "cli-start-build-path-missing-routes" \
  "Build routes directory not found" \
  ./dist/cli.js start --path "${ORPHAN_BUILD_SERVER}"
run_expected_failure_case \
  "cli-start-config-not-supported" \
  "not supported for .*vector start" \
  ./dist/cli.js start --config "${ALT_CONFIG_PATH}"
run_expected_failure_case \
  "cli-start-routes-not-supported" \
  "not supported for .*vector start" \
  ./dist/cli.js start --routes "${ROUTES_DIR}"

echo "==> All build/start matrix scenarios passed."
