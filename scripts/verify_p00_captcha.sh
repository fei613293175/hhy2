#!/usr/bin/env sh
set -eu

api_base=${P00_API_BASE:-http://127.0.0.1:18192}
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

create_code=$(curl -sS -o "$tmp_dir/create.json" -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "$api_base/api/v1/security/captcha/challenges" \
  --data '{"purpose":"admin_login","target":"p00-security-test"}')

challenge_id=$(sed -n 's/.*"challenge_id":"\([^"]*\)".*/\1/p' "$tmp_dir/create.json")
session_token=$(sed -n 's/.*"anonymous_session_token":"\([^"]*\)".*/\1/p' "$tmp_dir/create.json")
test "$create_code" = '200'
test -n "$challenge_id"
test -n "$session_token"

verify_wrong() {
  curl -sS -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -X POST "$api_base/api/v1/security/captcha/verify" \
    --data "{\"challenge_id\":\"$challenge_id\",\"anonymous_session_token\":\"$session_token\",\"purpose\":\"admin_login\",\"target\":\"p00-security-test\",\"answer\":\"WRONG\"}"
}

first=$(verify_wrong)
second=$(verify_wrong)
third=$(verify_wrong)
forged=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -X POST "$api_base/api/v1/security/captcha/verify" \
  --data '{"challenge_id":"not-a-real-id","anonymous_session_token":"forged","purpose":"admin_login","target":"p00-security-test","answer":"WRONG"}')

test "$first,$second,$third,$forged" = '422,422,429,403'
printf 'captcha black-box: create=%s wrong-attempts=%s,%s,%s forged-session=%s\n' \
  "$create_code" "$first" "$second" "$third" "$forged"
