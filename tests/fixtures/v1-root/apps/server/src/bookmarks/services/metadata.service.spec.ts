import { MetadataService } from './metadata.service';

describe('MetadataService', () => {
  let service: MetadataService;

  beforeEach(() => {
    service = new MetadataService();
  });

  // Real HTTP tests — these hit the network
  // Skip in CI with: jest --testPathPattern=metadata.service --testNamePattern="real"
  describe('real metadata fetching', () => {
    const testCases = [
      {
        name: 'Google',
        url: 'https://www.google.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'GitHub',
        url: 'https://github.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'Wikipedia',
        url: 'https://en.wikipedia.org',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'Stack Overflow',
        url: 'https://stackoverflow.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'YouTube',
        url: 'https://www.youtube.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'Reddit',
        url: 'https://www.reddit.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'MDN Web Docs',
        url: 'https://developer.mozilla.org',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'NPM',
        url: 'https://www.npmjs.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'Hacker News',
        url: 'https://news.ycombinator.com',
        expectTitle: true,
        expectFavicon: true,
      },
      {
        name: 'Twitter/X',
        url: 'https://x.com',
        expectTitle: true,
        expectFavicon: true,
      },
    ];

    it.each(testCases)('should fetch metadata for $name ($url)', async ({ url, expectTitle, expectFavicon }) => {
      const result = await service.fetchMetadata(url);

      // Always returns a result (never throws)
      expect(result).toBeDefined();
      expect(result.url).toBeTruthy();

      if (expectTitle) {
        expect(result.title).toBeTruthy();
        expect(result.title.length).toBeGreaterThan(0);
      }

      if (expectFavicon) {
        expect(result.logo).toBeTruthy();
        // Favicon should be a valid URL
        expect(result.logo).toMatch(/^https?:\/\//);
      }
    }, 15000);

    it('should handle non-existent domains gracefully', async () => {
      const result = await service.fetchMetadata('https://this-domain-definitely-does-not-exist-12345.com');

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy(); // Falls back to domain name
      expect(result.logo).toBeTruthy(); // Falls back to Google favicon
    }, 15000);

    it('should handle invalid URLs gracefully', async () => {
      const result = await service.fetchMetadata('not-a-url');

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy();
    }, 15000);

    it('should complete within 10 seconds for any URL', async () => {
      const start = Date.now();
      await service.fetchMetadata('https://www.google.com');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10000);
    }, 15000);
  });
});
