export const DESIGN_VERSION = '4.0.0-D02' as const;
export const THEME_NAME = '曜石星云·大型平台级资源增长系统' as const;

export type Platform = 'android' | 'h5' | 'admin';

export type PageId =
  | 'APP-HOME-001'
  | 'APP-PUBLISH-001'
  | 'APP-PUBLISH-002'
  | 'APP-PUBLISH-003'
  | 'APP-PUBLISH-004'
  | 'APP-PUBLISH-005'
  | 'APP-PUBLISH-006';

export type RoutePattern = `/publish${string}` | '/home';

export interface PageContract {
  pageId: PageId;
  platform: Platform;
  route: RoutePattern;
  defaultStateId: string;
  stateIds: readonly string[];
  preserveOnReturn: true;
  refreshOnBack: false;
}

export interface RenderArtifactContract {
  pageId: string;
  stateId: string;
  htmlPath: string;
  pngPath: string;
  targetDiffPercentMax: 2;
  criticalGeometryDiffPercentMax: 0.5;
}
