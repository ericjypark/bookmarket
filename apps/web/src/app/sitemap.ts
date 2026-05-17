import { type MetadataRoute } from 'next';
import { publicAppOrigin } from './_common/utils/public-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const appOrigin = publicAppOrigin();

  return [
    {
      url: appOrigin,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
  ];
}
