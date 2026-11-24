// GitHub Pages처럼 하위 경로에 올릴 때만 값이 있다. scripts/build-pages.mjs가 넣는다.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;
/** 제작실과 API 없이 랜딩과 가이드만 있는 사이트인지 */
export const publicSite = Boolean(siteOrigin);
export const asset = (path: `/${string}`) => basePath + path;
