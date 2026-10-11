/**
 * 여러 서버가 같은 문서를 덮어쓰지 않게 하기 (낙관적 잠금)
 *
 * 저장소(Supabase schoolfix_store)는 문서를 통째로 저장한다. Render 는 배포할 때 잠깐
 * 새 서버와 옛 서버를 함께 돌리는데, 두 서버가 각자 메모리에 든 목록을 저장하면
 * 나중에 저장한 쪽이 먼저 저장한 변경(그사이 들어온 신고 등)을 지운다.
 *
 * 그래서
 *  - 문서마다 마지막으로 읽은 버전(updated_at)을 기억하고, 저장할 때 그 버전이 그대로일 때만 쓴다.
 *  - 그사이 다른 서버가 바꿨으면 StoreConflictError 를 던지고,
 *    createDocLocks 가 최신 문서를 다시 읽은 뒤 같은 작업을 처음부터 다시 실행한다.
 *    작업은 "읽기 → 고치기 → 저장" 으로 짜여 있어서 다시 실행하면 최신 내용 위에 변경을 적용한다.
 */

export class StoreConflictError<K extends string = string> extends Error {
  constructor(readonly key: K) {
    super(`다른 서버가 ${key} 문서를 먼저 바꿨습니다.`);
    this.name = "StoreConflictError";
  }
}

/**
 * 새로 쓸 버전 값. 이전 버전보다 항상 뒤가 되게 해서, 같은 밀리초에 두 서버가 써도
 * "내가 마지막으로 본 버전" 과 우연히 같아지는 일이 없게 한다.
 */
export function nextStoreVersion(previous: string | null, now = Date.now()): string {
  const prev = previous ? Date.parse(previous) : Number.NaN;
  return new Date(Number.isFinite(prev) ? Math.max(now, prev + 1) : now).toISOString();
}

/**
 * 문서(키)마다 작업을 하나씩 차례로 실행한다. 작업이 StoreConflictError 로 실패하면
 * refresh(키) 로 최신 문서를 읽어 온 뒤 같은 작업을 다시 실행한다(최대 maxAttempts 번).
 *
 * 주의: 작업 안에서 같은 키로 다시 잠금을 걸면 서로 기다리다 멈춘다. 저장 함수는 잠금을 걸지 않는다.
 */
export function createDocLocks<K extends string>(refresh: (key: K) => Promise<void>, maxAttempts = 3) {
  const chains = new Map<K, Promise<unknown>>();
  return function withDocLock<T>(key: K, task: () => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await task();
        } catch (err) {
          if (!(err instanceof StoreConflictError) || attempt >= maxAttempts) throw err;
          console.warn(`[store] ${err.key} 문서가 다른 서버에서 바뀌어 다시 읽고 재시도합니다 (${attempt}/${maxAttempts - 1})`);
          await refresh(err.key as K);
        }
      }
    };
    const previous = chains.get(key) ?? Promise.resolve();
    const result = previous.then(run, run);
    chains.set(key, result.catch(() => undefined));
    return result;
  };
}
