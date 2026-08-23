#!/usr/bin/env bash
# Live-tests the Subscriptions flow against a real Invidious instance.
#
# Credentials live in .invidious-test.env (gitignored) next to this script:
#   TEST_INVIDIOUS_URL=https://invidious.example.tld
#   TEST_INVIDIOUS_TOKEN=<SID cookie value or JSON token>
#
# Usage:  ./run-subscription-test.sh            # all live tests
#         ./run-subscription-test.sh 03         # single test by number prefix
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .invidious-test.env ]; then
  echo "Missing .invidious-test.env — create it with:"
  echo '  TEST_INVIDIOUS_URL=https://your.instance.tld'
  echo '  TEST_INVIDIOUS_TOKEN=your-token'
  exit 1
fi
# shellcheck disable=SC1091
source .invidious-test.env

FILTER="com.kvtube.android.InvidiousSubscriptionLiveTest"
if [ $# -gt 0 ]; then
  FILTER="${FILTER}.0*${1}*"
fi

./gradlew :app:testDebugUnitTest \
  --tests "$FILTER" \
  "-Dtest.invidious.url=${TEST_INVIDIOUS_URL}" \
  "-Dtest.invidious.token=${TEST_INVIDIOUS_TOKEN}"

echo
echo "Output (feed sizes etc.): app/build/reports/tests/testDebugUnitTest/classes/com.kvtube.android.InvidiousSubscriptionLiveTest.html"
