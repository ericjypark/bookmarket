import { queryOptions } from '@tanstack/react-query';
import { getCategories } from '../../actions/category.action';

export const categoriesQuery = () =>
  queryOptions({
    queryKey: ['categories'],
    queryFn: getCategories,
  });
