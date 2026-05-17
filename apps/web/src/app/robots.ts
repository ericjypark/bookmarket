import { type MetadataRoute } from 'next';
import { publicAppOrigin } from './_common/utils/public-url';

export default function robots(): MetadataRoute.Robots {
  const appOrigin = publicAppOrigin();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${appOrigin}/sitemap.xml`,
  };
}
