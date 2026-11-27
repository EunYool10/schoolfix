/**
 * 완성된 HTML 문서를 새 창에 쓰고 인쇄 대화상자를 띄운다. 팝업이 막히면 false.
 *
 * document.close() 뒤에는 load 가 이미 끝났을 수 있어 readyState 를 먼저 본다.
 * 사진이 있으면 load 는 사진을 다 받은 뒤에 오므로, 사진이 빠진 채 인쇄되지 않는다.
 * load 가 끝내 오지 않는 브라우저를 대비해 시간이 지나면 한 번만 띄운다.
 */
export function openPrintWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    try {
      win.focus();
      win.print();
    } catch {
      // 사용자가 창을 먼저 닫은 경우
    }
  };
  if (win.document.readyState === "complete") start();
  else {
    win.addEventListener("load", start, { once: true });
    win.setTimeout(start, 4000);
  }
  return true;
}
