import { PAGINATION_DEFAULTS } from "@/src/config/constants";

export function resolvePagination(page?: number, pageSize?: number) {
  const safePage = !page || page < 1 ? PAGINATION_DEFAULTS.page : page;
  const safePageSize = !pageSize
    ? PAGINATION_DEFAULTS.pageSize
    : Math.min(Math.max(pageSize, 1), PAGINATION_DEFAULTS.maxPageSize);

  return {
    page: safePage,
    pageSize: safePageSize,
    skip: (safePage - 1) * safePageSize,
    take: safePageSize,
  };
}
