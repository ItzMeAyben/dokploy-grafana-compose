#!/usr/bin/env bash
# Send a sample OTLP metric to Alloy (forwarded to Prometheus) for testing

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_prompt.sh
source "${SCRIPT_DIR}/_prompt.sh"

NOW_NS=$(python3 -c "import time; print(int(time.time() * 1e9))")
VALUE="${1:-42.0}"

curl -s -u "${ALLOY_USER}:${ALLOY_PASSWORD}" -X POST "${ALLOY_ENDPOINT}/v1/metrics" \
  -H "Content-Type: application/json" \
  -d "{
  \"resourceMetrics\": [
    {
      \"resource\": {
        \"attributes\": [
          { \"key\": \"service.name\", \"value\": { \"stringValue\": \"curl-test\" } }
        ]
      },
      \"scopeMetrics\": [
        {
          \"scope\": { \"name\": \"test-scope\" },
          \"metrics\": [
            {
              \"name\": \"test_temperature\",
              \"gauge\": {
                \"dataPoints\": [
                  {
                    \"asDouble\": ${VALUE},
                    \"timeUnixNano\": \"${NOW_NS}\"
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}"

echo ""
echo "Metric sent. Query in Grafana (Prometheus datasource): test_temperature"
echo "Value: ${VALUE}"
