INSERT INTO app_configs(config_key, config_value, is_secret) VALUES
 ('platform.brand.name', '合伙云 Pro', false),
 ('platform.base_domain', 'orbexa.cc', false),
 ('domain.api.host', 'hhy-api.orbexa.cc', false),
 ('domain.admin.host', 'hhy-admin.orbexa.cc', false),
 ('domain.h5.host', 'hhy-h5.orbexa.cc', false),
 ('storage.provider', 'existing-compatible-object-storage', false),
 ('storage.endpoint', 'https://oss.orbexa.cc', false),
 ('storage.bucket', 'fuylink', false),
 ('storage.project_prefix', 'hhy/prod/', false),
 ('captcha.enabled', 'true', false),
 ('captcha.image.width', '160', false),
 ('captcha.image.height', '56', false),
 ('captcha.image.length', '5', false),
 ('captcha.challenge.ttl_seconds', '120', false),
 ('captcha.ticket.ttl_seconds', '180', false)
ON CONFLICT (config_key) DO NOTHING;
