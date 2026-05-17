const localKubeContextPatterns = [
  /^kind(?:-|$)/i,
  /^docker-desktop$/i,
  /^minikube$/i,
  /^rancher-desktop$/i,
  /^colima(?:-|$)/i,
  /^default$/i
];

export function productionKubeContextBlocker(currentContext, expectedContext) {
  if (!expectedContext) {
    return 'BOOKMARKET_PROD_KUBE_CONTEXT is not set to the Raspberry Pi k3s context.';
  }

  const expectedLocalReason = forbiddenLocalKubeContextReason(expectedContext);
  if (expectedLocalReason) {
    return `BOOKMARKET_PROD_KUBE_CONTEXT is unsafe: ${expectedLocalReason}`;
  }

  if (!currentContext) {
    return 'Current kube context could not be read.';
  }

  const currentLocalReason = forbiddenLocalKubeContextReason(currentContext);
  if (currentLocalReason) {
    return `Current kube context is unsafe: ${currentLocalReason}`;
  }

  if (currentContext !== expectedContext) {
    return `Current kube context is "${currentContext}", expected "${expectedContext}".`;
  }

  return '';
}

export function forbiddenLocalKubeContextReason(context) {
  const trimmed = (context ?? '').trim();
  if (!trimmed) {
    return '';
  }

  if (localKubeContextPatterns.some((pattern) => pattern.test(trimmed))) {
    return `"${trimmed}" looks like a local/development context, not the Raspberry Pi k3s production context.`;
  }

  return '';
}
