type OAuthProvider = 'google' | 'github';

type OAuthStateResponse = {
  state: string;
};

export const createOAuthState = async (provider: OAuthProvider) => {
  const response = await fetch('/api/oauth/state', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  });

  if (!response.ok) {
    throw new Error(`OAuth state request failed: ${response.status}`);
  }

  const body = await response.json() as OAuthStateResponse;

  return body.state;
};
