/*************************************************************
 * UNION ONE 출퇴근 PWA · service-worker.js
 * v14 · 2026-09-02 · 체감 속도
 *
 * - 앱스스크립트(script.google.com) 요청은 절대 손대지 않는다
 * - POST(출퇴근 기록 전송)도 절대 손대지 않는다
 *
 * ★ 화면은 캐시에서 **0초에** 뜬다.
 *   예전에는 '항상 최신 우선' 이라 통신을 2.5초까지 기다렸습니다.
 *   신호가 나쁜 현장에서는 그 2.5초를 서서 기다렸습니다.
 *   이제 캐시로 바로 띄우고, 새 화면은 뒤에서 받아 둡니다.
 *   달라졌으면 앱에 알려 주고(newversion), 다음에 열 때 새 것으로 뜹니다.
 *
 * ★ 아이콘·로고는 캐시에 있으면 **다시 받지 않는다.**
 *   안 바뀌는 그림인데 앱을 열 때마다 네 개를 확인하고 있었습니다.
 *
 * ★★ 그래서 **파일을 고치면 반드시 아래 CACHE_NAME 번호를 올려야 합니다.**
 *   올리지 않으면 새 그림이 폰에 영영 안 들어갑니다.
 *************************************************************/

const CACHE_NAME = "uo-attendance-v4";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./apple-touch-icon-180.png",
  "./uo-logo.png"
];


/* ============================================================
 * 설치
 * ========================================================== */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          CORE_ASSETS.map((url) => cache.add(url).catch(() => null))
        )
      )
      .then(() => self.skipWaiting())
  );
});


/* ============================================================
 * 활성화 · 이전 캐시 삭제
 * ========================================================== */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});


/* 물음표 뒤를 떼어낸 주소. 같은 파일이 여러 칸에 쌓이지 않게 합니다. */
function cacheKey(request) {
  const url = new URL(request.url);
  return url.origin + url.pathname;
}

function keep(cache, request, response) {
  if (!response || !response.ok || response.redirected) return;
  try {
    cache.put(cacheKey(request), response.clone()).catch(() => {});
  } catch (err) { /* 넣지 못해도 화면에는 영향이 없습니다 */ }
}


/* ============================================================
 * 요청 처리
 * ========================================================== */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  /* 출퇴근 기록 전송(POST)은 건드리지 않는다 */
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  /* 앱스스크립트 등 외부 도메인은 그대로 통과시킨다 */
  if (url.origin !== self.location.origin) {
    return;
  }


  /*
   * 앱 화면 — 캐시에 있으면 **기다리지 않고 바로** 띄운다 (v14 · 2026-09-02).
   *
   * ★ 예전에는 '항상 최신 우선' 이라 통신을 최대 2.5초까지 기다렸습니다.
   *   신호가 나쁜 지하 주차장이나 현장에서는 앱이 뜨기까지 그 2.5초를
   *   고스란히 서서 기다렸습니다. 아침저녁 5초로 끝나야 하는 앱입니다.
   *
   * ★ 최신 화면은 포기하지 않습니다.
   *   캐시로 즉시 띄우면서 **뒤에서 조용히 새 화면을 받아 캐시에 넣습니다.**
   *   글자가 달라졌으면 열려 있는 앱에 알려 주고(newversion),
   *   앱은 '새 버전이 준비되었습니다' 한 줄을 띄웁니다.
   *   쓰는 중에 화면을 강제로 갈아끼우지는 않습니다 —
   *   출근을 누르는 순간에 화면이 새로고침되면 안 됩니다.
   *   다음에 앱을 열면 새 것으로 뜹니다.
   */
  if (request.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(cacheKey(request), { ignoreSearch: true });

      if (cached) {
        event.waitUntil(refreshShell(cache, request, cached));
        return cached;
      }

      /* 처음 여는 폰 — 캐시가 없으니 받아올 수밖에 없다 */
      try {
        const fresh = await fetch(request, { cache: "no-cache" });
        if (fresh && fresh.ok) {
          keep(cache, request, fresh);
          return fresh;
        }
      } catch (err) { /* 아래 안내로 */ }

      const fallback = await caches.match("./index.html", { ignoreSearch: true });
      if (fallback) return fallback;

      return new Response(
        "오프라인 상태입니다.\n인터넷 연결 후 다시 실행해 주세요.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    })());
    return;
  }


  /*
   * 아이콘 · 로고 · manifest — 캐시에 있으면 그대로 쓰고 **다시 받지 않는다**.
   *
   * ★ 예전에는 캐시로 돌려주면서도 네트워크 요청을 매번 같이 띄웠습니다.
   *   한 번 정해지면 안 바뀌는 그림들인데 앱을 열 때마다 네 개를 다시 확인해서
   *   데이터와 배터리를 썼습니다.
   *   이 저장소는 파일이 바뀌면 CACHE_NAME 을 올리는 방식이므로
   *   (지금 이름은 위 CACHE_NAME) 뒤에서 다시 받을 이유가 없습니다.
   */
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(cacheKey(request), { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;

        return fetch(request)
          .then((response) => {
            keep(cache, request, response);
            return response;
          })
          .catch(() => cached);
      })
    )
  );
});


/* 뒤에서 새 화면을 받아 캐시에 넣고, 글자가 달라졌으면 앱에 알린다. */
async function refreshShell(cache, request, cached) {
  let fresh;
  try {
    fresh = await fetch(request, { cache: "no-cache" });
  } catch (err) {
    return;                       /* 통신이 안 되면 다음 기회에 */
  }
  if (!fresh || !fresh.ok || fresh.redirected) return;

  let 옛글, 새글;
  try {
    옛글 = await cached.clone().text();
    새글 = await fresh.clone().text();
  } catch (err) {
    return;
  }

  if (옛글 === 새글) return;      /* 바뀐 것이 없다 */

  try {
    await cache.put(cacheKey(request), fresh.clone());
  } catch (err) { /* 못 넣어도 다음에 다시 받는다 */ }

  const clients = await self.clients.matchAll({ type: "window" });
  clients.forEach((one) => {
    try { one.postMessage({ type: "newversion" }); } catch (err) {}
  });
}
