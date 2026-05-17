export function releaseBlockerHint(blocker) {
  if (blocker.startsWith('BOOKMARKET_OAUTH_SMOKE_SIGNOFF')) {
    return 'Run pnpm smoke:oauth-provider:evidence-audit first to confirm whether dedicated provider evidence exists without printing secrets; use pnpm smoke:oauth-provider:evidence-audit:require when you expect it to fail until evidence exists. Run pnpm smoke:oauth-provider:preflight to prove the route/profile/env is ready, and pnpm smoke:oauth-provider:provider-starts with BOOKMARKET_OAUTH_PROVIDER_START_APPROVED=1 to verify pre-login Google/GitHub authorization URLs from the copied v1 buttons. Then run pnpm smoke:oauth-provider with a local/staging OAuth app and a dedicated provider test account, or use an explicitly approved operator Chrome credential browser check; require v2 route-target proof, redirect/session cookies, avatar/profile menu evidence, and /api/v1/users/me identity evidence before setting BOOKMARKET_OAUTH_SMOKE_SIGNOFF.';
  }

  if (blocker.startsWith('BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF')) {
    return 'After the OAuth provider signoff exists, run pnpm smoke:production:release against the Pi k3s context with restart/PVC approval and set BOOKMARKET_PRODUCTION_SMOKE_SIGNOFF only from that real run.';
  }

  if (blocker.startsWith('BOOKMARKET_MIGRATION_CUTOVER_SIGNOFF')) {
    return 'After explicit real-user-data migration and normal public-traffic cutover approval, run the production v1 export, v2 import, count/ownership validation, normal-route cutover to k3s, rollback check, and pnpm migration:production-cutover.';
  }

  if (blocker.startsWith('BOOKMARKET_BACKUP_SIGNOFF')) {
    return 'Run pnpm backup:production, rehearse restore with pnpm backup:production:restore-check or pg_restore, then set BOOKMARKET_BACKUP_SIGNOFF from that evidence.';
  }

  if (blocker.startsWith('BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF')) {
    return 'Run pnpm smoke:production:test-account with a dedicated Bookmarket email-login test account, verify disposable bookmark/category coverage and cleanup counts, then set BOOKMARKET_TEST_ACCOUNT_SMOKE_SIGNOFF.';
  }

  if (blocker.startsWith('BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF')) {
    return 'Run pnpm smoke:authenticated-prod-oracle in read-only mode against the v1 production oracle, then set BOOKMARKET_AUTHENTICATED_PROD_ORACLE_SIGNOFF from the observed /home, command-menu, profile, and public-profile evidence.';
  }

  if (blocker.startsWith('BOOKMARKET_RESTART_SMOKE_APPROVED')) {
    return 'Set BOOKMARKET_RESTART_SMOKE_APPROVED=1 only when production pod restarts and StatefulSet PVC survival checks are approved for the release smoke.';
  }

  if (blocker.startsWith('BOOKMARKET_PROD_KUBE_CONTEXT')) {
    return 'Switch kubectl to the Raspberry Pi k3s context, export BOOKMARKET_PROD_KUBE_CONTEXT with the exact active context name, and run pnpm preflight:production-context.';
  }

  if (blocker.includes('BOOKMARKET_WEB_URL') || blocker.includes('BOOKMARKET_API_URL')) {
    return 'Fix the public web/API health, TLS, DNS, or ingress route first; release signoffs are not sufficient while public endpoint probes fail.';
  }

  if (blocker.startsWith('BOOKMARKET_REAL_DATA_MIGRATION_APPROVED') || blocker.startsWith('BOOKMARKET_PUBLIC_TRAFFIC_CUTOVER_APPROVED')) {
    return 'Do not set migration/cutover approval flags until real user data migration and normal public traffic cutover are explicitly approved for this release.';
  }

  if (blocker.startsWith('BOOKMARKET_CONFIRM_')) {
    return 'Set migration/cutover confirmation flags only after the named production migration, validation, normal-route cutover, or rollback step has actually completed.';
  }

  return '';
}
