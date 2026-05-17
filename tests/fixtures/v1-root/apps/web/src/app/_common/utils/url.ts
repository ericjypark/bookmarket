/**
 * Safely extracts the domain from a URL string
 * @param url - The URL string to parse
 * @returns The hostname or a fallback value if parsing fails
 */
export const getDomainSafely = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    console.warn('Invalid URL provided for domain extraction:', url);
    return 'invalid-url';
  }
};

/**
 * Safely extracts username from a shared profile URL path
 * Expected format: /s/[username]/...
 * @param pathname - The pathname to parse
 * @returns The username or null if not found
 */
export const extractUsernameFromPath = (pathname: string): string | null => {
  try {
    const pathParts = pathname.split('/');
    const sIndex = pathParts.indexOf('s');
    
    if (sIndex === -1 || sIndex + 1 >= pathParts.length) {
      return null;
    }
    
    const username = pathParts[sIndex + 1];
    return username && username.trim() ? username : null;
  } catch (error) {
    console.warn('Failed to extract username from path:', pathname, error);
    return null;
  }
};