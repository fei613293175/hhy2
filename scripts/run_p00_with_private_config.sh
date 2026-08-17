#!/usr/bin/env sh
set -eu

runtime_dir=${HHY_P00_RUNTIME_DIR:-/root/hhy2-p00-runtime}
secret_dir=${HHY_P00_SECRET_DIR:-/root/hhy2-p00-runtime-secrets}
source_package=${1:?usage: run_p00_with_private_config.sh /path/to/final-package.zip <docker-compose args>}
shift

base_env="$secret_dir/runtime.base.env"
certificate_dir="$secret_dir/alipay-payout"
work_dir=$(mktemp -d "$secret_dir/source.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT HUP INT TERM

if [ ! -s "$base_env" ]; then
  umask 077
  {
    printf 'DATABASE_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'CAPTCHA_HMAC_SECRET=%s\n' "$(openssl rand -hex 48)"
    printf '%s\n' 'PUBLIC_API_HOST=hhy-api.orbexa.cc'
    printf '%s\n' 'PUBLIC_ADMIN_HOST=hhy-admin.orbexa.cc'
    printf '%s\n' 'PUBLIC_H5_HOST=hhy-h5.orbexa.cc'
    printf '%s\n' 'STORAGE_PUBLIC_BASE_URL=https://oss.orbexa.cc'
    printf '%s\n' 'STORAGE_BUCKET=fuylink'
    printf '%s\n' 'STORAGE_PROJECT_PREFIX=hhy/prod/'
    printf '%s\n' 'CORS_ORIGIN=https://hhy-admin.orbexa.cc'
  } > "$base_env"
  chmod 600 "$base_env"
fi

inner_archive=$(unzip -Z1 "$source_package" | grep -E '/04_通用私有母版与真实配置_禁止公开/.*XApay.*\.zip$' | head -n 1)
test -n "$inner_archive"
unzip -p "$source_package" "$inner_archive" > "$work_dir/master.zip"
unzip -q "$work_dir/master.zip" -d "$work_dir/master"
private_env=$(find "$work_dir/master" -type f -name PRIVATE_INTEGRATIONS.env | head -n 1)
credentials_dir=$(find "$work_dir/master" -type d -path '*PRIVATE_CREDENTIALS/alipay-payout' | head -n 1)
test -n "$private_env"
test -n "$credentials_dir"

# The private source is only interpreted in this process. Values never enter Git or logs.
. "$private_env"
. "$base_env"

install -d -m 700 "$certificate_dir"
install -m 600 "$credentials_dir/private.pem" "$certificate_dir/private.pem"
install -m 600 "$credentials_dir/app-cert.pem" "$certificate_dir/app-cert.pem"
install -m 600 "$credentials_dir/alipay-cert.pem" "$certificate_dir/alipay-cert.pem"
install -m 600 "$credentials_dir/root-cert.pem" "$certificate_dir/root-cert.pem"

STORAGE_S3_ENDPOINT=$R2_S3_API
STORAGE_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY
SMTP_USERNAME=$SMTP_FROM_ADDRESS
IDENTITY_PROVIDER_URL="https://${IDENTITY_PROVIDER_HOST}${IDENTITY_PROVIDER_PATH}"
IDENTITY_PROVIDER_APPCODE=$IDENTITY_PROVIDER_APP_CODE
FUYUN_BASE_URL=$FUYLINK_BASE_URL
FUYUN_PID=$FUYLINK_MERCHANT_ID
FUYUN_KEY=$FUYLINK_MERCHANT_KEY
XAPAY_GATEWAY_URL=$XAPAY_GATEWAY
PAYOUT_CERTS_HOST_DIR=$certificate_dir
ALIPAY_PAYOUT_PRIVATE_KEY_PATH=/run/secrets/alipay-payout/private.pem
ALIPAY_PAYOUT_APP_CERT_PATH=/run/secrets/alipay-payout/app-cert.pem
ALIPAY_PAYOUT_ALIPAY_CERT_PATH=/run/secrets/alipay-payout/alipay-cert.pem
ALIPAY_PAYOUT_ROOT_CERT_PATH=/run/secrets/alipay-payout/root-cert.pem

export DATABASE_PASSWORD CAPTCHA_HMAC_SECRET PUBLIC_API_HOST PUBLIC_ADMIN_HOST PUBLIC_H5_HOST
export STORAGE_PUBLIC_BASE_URL STORAGE_BUCKET STORAGE_PROJECT_PREFIX CORS_ORIGIN
export STORAGE_S3_ENDPOINT STORAGE_ACCESS_KEY_ID STORAGE_SECRET_ACCESS_KEY
export SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD
export IDENTITY_PROVIDER_URL IDENTITY_PROVIDER_APPCODE
export FUYUN_BASE_URL FUYUN_PID FUYUN_KEY XAPAY_GATEWAY_URL XAPAY_PID XAPAY_KEY
export PAYOUT_CERTS_HOST_DIR ALIPAY_PAYOUT_APP_ID ALIPAY_PAYOUT_PRIVATE_KEY_PATH
export ALIPAY_PAYOUT_APP_CERT_PATH ALIPAY_PAYOUT_ALIPAY_CERT_PATH ALIPAY_PAYOUT_ROOT_CERT_PATH

cd "$runtime_dir"
exec docker compose --env-file "$base_env" "$@"
