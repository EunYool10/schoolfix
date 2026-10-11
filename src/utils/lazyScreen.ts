/**
 * 화면 코드를 들어갈 때 불러온다(React.lazy).
 *
 * 화면 파일 이름에는 빌드마다 바뀌는 해시가 붙는다. 페이지를 열어 둔 채 새 버전이 배포되면
 * 예전 파일이 서버에서 사라져, 그 뒤 처음 여는 화면을 불러오지 못한다.
 * 그때는 한 번만 새로고침해 새 버전을 받는다. 새로고침 뒤에도 실패하면(서버 장애 등) 오류를 그대로 던진다.
 */

import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "schoolfix_chunk_reload_v1";

export function lazyScreen<T extends ComponentType<any>>(load: () => Promise<T>) {
  return lazy(async () => {
    try {
      const component = await load();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* 저장소가 막혀도 화면은 연다 */ }
      return { default: component };
    } catch (err) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
        sessionStorage.setItem(RELOAD_KEY, "1");
      } catch {
        // 기록할 수 없으면 무한 새로고침을 피하려고 새로고침하지 않는다.
        alreadyReloaded = true;
      }
      if (!alreadyReloaded) {
        window.location.reload();
        // 새로고침이 끝날 때까지 화면을 그대로 둔다.
        return new Promise<never>(() => {});
      }
      throw err;
    }
  });
}
