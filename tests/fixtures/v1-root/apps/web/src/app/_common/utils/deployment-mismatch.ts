const RELOAD_KEY = 'stale-deployment-reload';
const RELOAD_COOLDOWN_MS = 30_000;

export function isStaleDeploymentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message ?? '';
  return msg.includes('Failed to find Server Action') || msg.includes('older or newer deployment');
}

export function handleStaleDeployment(): void {
  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  if (lastReload && Date.now() - parseInt(lastReload, 10) < RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
  window.location.reload();
}

export function withDeploymentCheck<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: unknown) => {
    if (isStaleDeploymentError(error)) handleStaleDeployment();
    throw error;
  });
}
