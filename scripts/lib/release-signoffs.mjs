export function missingOAuthSmokeSignoffFields(signoff) {
  if (isTrivialSignoff(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  return missingRequiredFields(signoff, [
    ['Google provider result', /google/i],
    ['GitHub provider result', /github/i],
    [`smoke date ${releaseDate}`, exactDatePattern(releaseDate)],
    [
      'real OAuth browser smoke evidence',
      /(?:pnpm\s+smoke:oauth-provider(?!:)|node\s+scripts\/oauth-provider-smoke\.mjs(?!\s+--(?:dry-run|route-target-only|preflight-only))|(?:Computer Use|Browser Use|browser-use|Chrome credential)[^.:\n;]*(?:OAuth|provider)[^.:\n;]*(?:smoke|check|test))/i
    ],
    [
      'approved provider credential account',
      /\b(?:dedicated\s+provider\s+test[- ]?account|dedicated\s+test\s+provider\s+account|operator[- ]approved\s+(?:Chrome|browser|personal)\s+(?:credential|credentials|account)|operator\s+Chrome\s+credential(?:s)?|user[- ]approved\s+(?:Chrome|personal)\s+(?:credential|credentials|account))\b/i
    ],
    ['local or staging OAuth app', /(\b(local|staging|test|sandbox|dev)\b[^.:\n;]*\boauth\b[^.:\n;]*\bapp\b)|(\boauth\b[^.:\n;]*\bapp\b[^.:\n;]*\b(local|staging|test|sandbox|dev)\b)/i],
    ['v2 route target proof', /v2[^.:\n;]*(route|target)|route[^.:\n;]*target|direct[^.:\n;]*k3s[^.:\n;]*web[^.:\n;]*pod|k3s[^.:\n;]*fingerprint/i],
    ['OAuth route sha256 fingerprint values', /\/login:[0-9a-f]{64}[\s\S]*\/home:[0-9a-f]{64}|\/home:[0-9a-f]{64}[\s\S]*\/login:[0-9a-f]{64}/i],
    ['redirect result', /redirect|\/home/i],
    ['avatar/profile shell evidence', /avatar|profile[^.:\n;]*(menu|shell)|settings[^.:\n;]*logout|logout[^.:\n;]*settings/i],
    ['cookie/session result', /cookie|session/i],
    ['users/me identity evidence', /users\/me|identity[^.:\n;]*(email|account)|email[^.:\n;]*(confirmed|matched)/i],
    [
      'users/me identity account value',
      /(?:users\/me|identity)[^.:\n;]*(?:email|account)[^.:\n;]*(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|operator[- ]approved\s+Chrome\s+account|operator\s+Chrome\s+account)/i
    ]
  ]);
}

export function missingBackupSignoffFields(signoff) {
  if (isTrivialSignoff(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  return missingRequiredFields(signoff, [
    [`backup date ${releaseDate}`, exactDatePattern(releaseDate)],
    ['backup mention', /backup/i],
    ['storage location or backup identifier', /\b(s3|gs|file|path|pvc|postgres|pg_dump|snapshot|backup[-_ ]?id|sha256|\/|:)\b/i],
    ['restore or rollback readiness', /restore|rollback|restorable|verified/i],
    ['restore rehearsal evidence', /restore[-_ ]?check|pg_restore|restore rehearsal/i]
  ]);
}

export function missingProductionTestAccountSignoffFields(signoff) {
  if (isTrivialSignoff(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  return missingRequiredFields(signoff, [
    [`test-account smoke date ${releaseDate}`, exactDatePattern(releaseDate)],
    ['smoke:production:test-account command evidence', /smoke:production:test-account|production-test-account-smoke/i],
    ['test account identifier', /test[- ]?account|@/i],
    ['email login or session evidence', /email login|logged[- ]?in|session/i],
    ['bookmark create evidence', /bookmark[^.:\n;]*(create|created)/i],
    ['bookmark open evidence', /bookmark[^.:\n;]*open/i],
    ['bookmark copy evidence', /bookmark[^.:\n;]*copy/i],
    ['bookmark rename evidence', /bookmark[^.:\n;]*rename/i],
    ['bookmark category assignment evidence', /bookmark[^.:\n;]*(category|recategor)/i],
    ['bookmark metadata/refetch evidence', /metadata|refetch/i],
    ['bookmark delete evidence', /bookmark[^.:\n;]*(delete|deleted)/i],
    ['category create evidence', /category[^.:\n;]*(create|created)/i],
    ['category delete evidence', /category[^.:\n;]*(delete|deleted)/i],
    ['cleanup/no real data evidence', /cleaned up|cleanup|deleted disposable|no real user data|no real account data/i],
    ['disposable bookmark/category cleanup count evidence', /(?:bookmark|bookmarks)[^.:\n;]*(?:category|categories)[^.:\n;]*0\|0|0\|0[^.:\n;]*(?:bookmark|bookmarks)[^.:\n;]*(?:category|categories)/i]
  ]);
}

export function missingAuthenticatedProdOracleFields(signoff) {
  if (signoff.length < 50 || /^(1|true|yes|done|passed)$/i.test(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  return missingRequiredFields(signoff, [
    [`oracle date ${releaseDate}`, exactDatePattern(releaseDate)],
    ['smoke:authenticated-prod-oracle command evidence', /smoke:authenticated-prod-oracle|authenticated-production-oracle-smoke/i],
    ['authenticated/session evidence', /authenticated|session|logged[- ]?in/i],
    ['read-only evidence', /read[- ]?only|no mutation|no production mutation/i],
    ['/home inspection', /\/home/i],
    ['bookmark list layout inspection', /bookmark[^.:\n;]*(list|layout)|(list|layout)[^.:\n;]*bookmark/i],
    ['category filter behavior inspection', /category[^.:\n;]*(filter|c=)|(filter|c=)[^.:\n;]*category/i],
    ['command menu inspection', /command/i],
    ['profile settings or subdomain inspection', /(profile|settings)[^.:\n;]*subdomain|subdomain[^.:\n;]*(profile|settings)/i],
    ['public profile behavior inspection', /public profile[^.:\n;]*(behavior|\/s\/)|(behavior|\/s\/)[^.:\n;]*public profile|\/s\//i]
  ]);
}

export function missingProductionSmokeSignoffFields(signoff, { expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT } = {}) {
  if (isTrivialSignoff(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  const productionContextRequirement = productionKubeContextRequirement(expectedContext);
  return missingRequiredFields(signoff, [
    [`production smoke date ${releaseDate}`, exactDatePattern(releaseDate)],
    ['smoke:production:release command evidence', /smoke:production:release|production-smoke-check/i],
    ['passed/completed result', /pass|passed|complete|completed|succeed|succeeded/i],
    productionContextRequirement,
    ['web health evidence', /web[^.:\n;]*health|health[^.:\n;]*web/i],
    ['api health/readiness evidence', /api[^.:\n;]*(health|readiness)|(health|readiness)[^.:\n;]*api/i],
    ['pod rollout or PVC evidence', /pod|pods|rollout|pvc/i],
    ['Postgres health evidence', /postgres|pg_isready/i],
    ['Redis health evidence', /redis|pong/i],
    ['Kafka health/topic evidence', /kafka|topic/i],
    ['Elasticsearch health evidence', /elasticsearch|elastic|9200/i],
    ['restart/PVC survival evidence', /restart[^.:\n;]*pvc|pvc[^.:\n;]*survival|restart[^.:\n;]*survival/i]
  ]);
}

function productionKubeContextRequirement(expectedContext) {
  const context = (expectedContext ?? '').trim();
  if (!context) {
    return ['production kube context evidence', /kube|k3s|context|cluster/i];
  }

  return [
    `production kube context ${context}`,
    new RegExp(`\\b${escapeRegExp(context)}\\b`)
  ];
}

export function missingMigrationCutoverSignoffFields(signoff, { expectedContext = process.env.BOOKMARKET_PROD_KUBE_CONTEXT } = {}) {
  if (isTrivialSignoff(signoff)) {
    return ['nontrivial summary'];
  }

  const releaseDate = expectedReleaseDate();
  const productionContextRequirement = productionKubeContextRequirement(expectedContext);
  return missingRequiredFields(signoff, [
    [`migration/cutover date ${releaseDate}`, exactDatePattern(releaseDate)],
    productionContextRequirement,
    ['export/import or migration command evidence', /export:v1|import:v2|migration/i],
    ['real production data scope', /real[^.:\n;]*data|production[^.:\n;]*data|user[^.:\n;]*data/i],
    ['count and ownership validation', /(count|counts)[^.:\n;]*(ownership|orphan)|(ownership|orphan)[^.:\n;]*(count|counts)/i],
    ['public traffic cutover evidence', /cutover|traffic[^.:\n;]*switch|switched[^.:\n;]*traffic|normal[^.:\n;]*route/i],
    ['normal UI route evidence', /\/login|\/home|normal[^.:\n;]*ui|ui[^.:\n;]*route/i],
    ['k3s or ingress target evidence', /k3s|ingress|raspberry\s*pi|\bpi\b/i],
    ['direct k3s route fingerprint evidence', /(direct|k3s|web pod)[^.:\n;]*(fingerprint|hash|digest|matched)|(fingerprint|hash|digest|matched)[^.:\n;]*(direct|k3s|web pod)/i],
    ['normal route sha256 fingerprint values', /\/login:[0-9a-f]{64}[\s\S]*\/home:[0-9a-f]{64}|\/home:[0-9a-f]{64}[\s\S]*\/login:[0-9a-f]{64}/i],
    ['backup or rollback evidence', /backup|rollback|restore/i]
  ]);
}

function isTrivialSignoff(signoff) {
  return signoff.length < 40 || /^(1|true|yes|done|passed)$/i.test(signoff);
}

function missingRequiredFields(value, required) {
  return required
    .filter(([, pattern]) => !pattern.test(value))
    .map(([label]) => label);
}

function expectedReleaseDate() {
  const configuredDate = (process.env.BOOKMARKET_RELEASE_DATE ?? '').trim();
  if (configuredDate.length > 0) {
    return configuredDate;
  }

  const timeZone = process.env.TZ || 'Asia/Seoul';
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function exactDatePattern(date) {
  return new RegExp(`\\b${escapeRegExp(date)}\\b`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
