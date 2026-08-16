export interface ScrollAnchor {
  key: string;
  offsetPx: number;
}

export interface ListSnapshot {
  query?: string;
  tab?: string;
  filters: Readonly<Record<string, string | number | boolean | null>>;
  page: number;
  scrollAnchor?: ScrollAnchor;
  loadedItemIds: readonly string[];
}

export interface PageInstanceSnapshot {
  instanceKey: string;
  route: string;
  capturedAt: string;
  list?: ListSnapshot;
}

/**
 * Back navigation restores the existing instance. It must not create a new
 * route instance, reset pagination, or move the content to the top.
 */
export function restorePageInstance(
  current: PageInstanceSnapshot | undefined,
  requestedRoute: string,
): PageInstanceSnapshot | undefined {
  if (!current || current.route !== requestedRoute) return undefined;
  return {
    ...current,
    list: current.list
      ? {
          ...current.list,
          filters: { ...current.list.filters },
          loadedItemIds: [...current.list.loadedItemIds],
          scrollAnchor: current.list.scrollAnchor
            ? { ...current.list.scrollAnchor }
            : undefined,
        }
      : undefined,
  };
}
