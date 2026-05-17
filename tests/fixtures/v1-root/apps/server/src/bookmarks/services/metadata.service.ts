import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

export interface UrlMetadata {
  title: string;
  description: string;
  logo?: string;
  url: string;
}

@Injectable()
export class MetadataService {
  private readonly TIMEOUT = 8000;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  async fetchMetadata(url: string): Promise<UrlMetadata> {
    const normalizedUrl = this.normalizeUrl(url);

    try {
      const html = await this.fetchHtml(normalizedUrl);
      const metadata = this.parseMetadata(html, normalizedUrl);

      return {
        title: metadata.title || this.extractTitleFromUrl(normalizedUrl),
        description: metadata.description || '',
        logo: metadata.logo || this.getGoogleFavicon(normalizedUrl),
        url: normalizedUrl,
      };
    } catch {
      return {
        title: this.extractTitleFromUrl(normalizedUrl),
        description: '',
        logo: this.getGoogleFavicon(normalizedUrl),
        url: normalizedUrl,
      };
    }
  }

  private async fetchHtml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.TIMEOUT);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Only read first 500KB to get metadata from <head>
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let html = '';
      const maxBytes = 512 * 1024;

      while (html.length < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });

        // Stop early if we've passed </head> — we have all we need
        if (html.includes('</head>')) break;
      }

      reader.cancel();
      return html;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseMetadata(html: string, url: string): Partial<UrlMetadata> {
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      '';

    const description =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="og:description"]').attr('content') ||
      $('meta[name="twitter:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      '';

    const logo = this.extractFavicon($, url);

    return {
      title: this.cleanText(title),
      description: this.cleanText(description),
      logo,
    };
  }

  private extractFavicon($: cheerio.CheerioAPI, url: string): string | undefined {
    // Priority order: explicit icon links, then apple-touch-icon, then /favicon.ico fallback
    const selectors = [
      'link[rel="icon"][type="image/svg+xml"]',
      'link[rel="icon"][sizes="32x32"]',
      'link[rel="icon"][sizes="16x16"]',
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
    ];

    for (const selector of selectors) {
      const href = $(selector).first().attr('href');
      if (href) {
        const resolved = this.resolveUrl(url, href);
        if (resolved) return resolved;
      }
    }

    return undefined;
  }

  private getGoogleFavicon(url: string): string {
    try {
      const { hostname } = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      return '';
    }
  }

  private resolveUrl(base: string, relative: string): string | undefined {
    try {
      if (relative.startsWith('data:')) return undefined;
      return new URL(relative, base).toString();
    } catch {
      return undefined;
    }
  }

  private normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return `https://${url}`;
    }
    return url;
  }

  private cleanText(text: string): string {
    return text.trim().replace(/\s+/g, ' ').substring(0, 500);
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const { hostname } = new URL(url);
      const domain = hostname.replace('www.', '').split('.')[0];
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    } catch {
      return url;
    }
  }
}
