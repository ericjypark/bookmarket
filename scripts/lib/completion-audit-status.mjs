import fs from 'node:fs';
import path from 'node:path';

export function completionAuditStatusBlocker({
  auditPath = path.join(process.cwd(), 'docs/testing/completion-audit.md'),
  readFile = fs.readFileSync
} = {}) {
  let audit;
  try {
    audit = readFile(auditPath, 'utf8');
  } catch (error) {
    return `docs/testing/completion-audit.md could not be read before final release readiness pass: ${error.message}`;
  }

  return completionAuditTextStatusBlocker(audit);
}

export function completionAuditTextStatusBlocker(audit) {
  if (/^Status:\s*complete\./im.test(audit)) {
    return '';
  }

  if (/^Status:\s*not complete\./im.test(audit)) {
    return 'docs/testing/completion-audit.md still says Status: not complete; update the completion audit after every goal.md requirement is actually satisfied.';
  }

  return 'docs/testing/completion-audit.md does not contain an explicit Status: complete. line.';
}
