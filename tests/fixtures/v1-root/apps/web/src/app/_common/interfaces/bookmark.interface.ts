import { type Category } from './category.interface';

export interface Bookmark {
  id: string;
  url: string;
  title?: string;
  description?: string;
  faviconUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  category?: Category;
}
