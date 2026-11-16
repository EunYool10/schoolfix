const CHECK_EVERY_MS = 30 * 60_000;

function addNotice(): void {
  if (document.getElementById('app-update-notice')) return;
  const notice = document.createElement('aside');
  notice.id = 'app-update-notice';
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'position:fixed;z-index:2147483647;inset:auto 16px 16px 16px;margin:auto;max-width:560px;padding:14px 16px;border:1px solid #9fb8ff;border-radius:14px;background:#14213e;color:#fff;box-shadow:0 12px 40px #0006;display:flex;align-items:center;gap:12px;font:14px/1.5 system-ui,sans-serif';

  const text = document.createElement('span');
  text.textContent = 'SchoolFix 새 버전이 준비됐어요.';
  text.style.flex = '1';
  const update = document.createElement('button');
  update.type = 'button';
  update.textContent = '지금 업데이트';
  update.style.cssText = 'border:0;border-radius:9px;padding:9px 13px;background:#dce5ff;color:#163269;font-weight:700;cursor:pointer;white-space:nowrap';
  update.addEventListener('click', () => window.location.reload());
  const later = document.createElement('button');
  later.type = 'button';
  later.setAttribute('aria-label', '나중에');
  later.textContent = '나중에';
  later.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;white-space:nowrap';
  later.addEventListener('click', () => notice.remove());
  notice.append(text, update, later);
  document.body.append(notice);
}

export function initAppUpdateNotice(): void {
  let baseline = '';
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const url = new URL('/', window.location.origin);
      url.searchParams.set('__app_update_check', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'text/html' } });
      if (!response.ok) return;
      const html = await response.text();
      if (!baseline) baseline = html;
      else if (html !== baseline) addNotice();
    } catch {
      // Update checks are best effort; an offline or temporary network error must not affect the app.
    } finally {
      checking = false;
    }
  };
  void check();
  window.setInterval(() => void check(), CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
