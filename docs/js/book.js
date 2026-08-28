/* ── Zoom in Taitung 線上翻頁書 ────────────────────────────────
   資料來源：pages/<期別>/manifest.json（由 tools/make_manifest.py 產生）
   要換一期，改下面 ISSUE 這一行就好，不必動其他程式碼。            */

const ISSUE = 'vol2';
const BASE  = 'pages/' + ISSUE + '/';

/* 單頁寬度下限。StPageFlip 的判斷式是：
       容器寬度 < minWidth × 2  →  單頁模式
   iPhone 橫向寬約 844–932px，設 500 → 門檻 1000px，橫向仍會是單頁。
   若設成 400，門檻只有 800，iPhone 橫向就會變成跨頁，
   單頁被壓到剩 400px，比直向更難讀。這個值不要往下調。 */
const MIN_PAGE_W = 500;

const isPhone = matchMedia('(max-width: 820px)').matches;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), bookEl = $('book');

let manifest, ratio, pageFlip, imgs = [];

/* ── 依可用空間算出書本尺寸 ──────────────────────────────
   Google Sites 的 iframe 高度固定，所以要用「高度」回推寬度，
   讓整本書剛好塞滿，不會被切掉也不會留一大塊空白。            */
function fit() {
  const box = stage.getBoundingClientRect();
  const availW = box.width  - 16;   // 扣掉 .stage 的 padding
  const availH = box.height - 16;
  if (availW <= 0 || availH <= 0) return;

  // 先假設跨頁：兩頁並排時的理想寬度
  const spreadW = Math.min(availW, availH * ratio * 2);
  // 用和 StPageFlip 一樣的判斷式決定要不要跨頁，兩邊結論才會一致
  const useSpread = spreadW >= MIN_PAGE_W * 2;

  const pageW = useSpread ? Math.min(availW / 2, availH * ratio)
                          : Math.min(availW,     availH * ratio);
  const pageH = pageW / ratio;

  bookEl.style.width  = Math.floor(pageW * (useSpread ? 2 : 1)) + 'px';
  bookEl.style.height = Math.floor(pageH) + 'px';
  if (pageFlip) pageFlip.update();
}

/* ── 圖片延遲載入 ────────────────────────────────────────
   68 頁的 WebP 加起來近 20MB，一次全載在手機上會很痛。
   只載目前頁前後幾頁，翻到哪載到哪。                        */
function preload(center) {
  for (let i = center - 2; i <= center + 4; i++) {
    const img = imgs[i];
    if (img && !img.src) img.src = img.dataset.src;
  }
}

/* ── 放大檢視 ─────────────────────────────────────────── */
const zoomBox = $('zoom'), zoomImg = $('zoomImg'), zoomScroll = $('zoomScroll');
let zoomBig = false;

function openZoom(idx) {
  const name = manifest.pages[idx];
  if (!name) return;
  zoomImg.src = BASE + name + '@zoom.jpg';
  zoomImg.alt = manifest.title + ' 第 ' + (idx + 1) + ' 頁';
  zoomBox.hidden = false;
  setZoomScale(false);
  $('zoomHint').classList.remove('gone');
  setTimeout(() => $('zoomHint').classList.add('gone'), 2600);
}
function setZoomScale(big) {
  zoomBig = big;
  // 縮回時整頁塞進畫面；放大時給 2.2 倍，用原生捲動平移
  zoomImg.style.width  = big ? Math.round(zoomScroll.clientWidth * 2.2) + 'px' : 'auto';
  zoomImg.style.height = big ? 'auto' : '100%';
  zoomImg.style.maxWidth = big ? 'none' : '100%';
  if (big) {   // 放大後把視角移到中央，不然會停在左上角
    zoomScroll.scrollLeft = (zoomScroll.scrollWidth - zoomScroll.clientWidth) / 2;
  }
}
function closeZoom() { zoomBox.hidden = true; zoomImg.removeAttribute('src'); }

zoomImg.addEventListener('click', () => setZoomScale(!zoomBig));
$('zoomClose').addEventListener('click', closeZoom);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !zoomBox.hidden) closeZoom(); });

/* ── 啟動 ─────────────────────────────────────────────── */
fetch(BASE + 'manifest.json')
  .then(r => r.json())
  .then(m => {
    manifest = m;
    ratio = m.pageWidth / m.pageHeight;

    // 建立頁面元素。第一頁與最後一頁標成 hard（書殼），
    // 配合 showCover 讓封面、封底各自單獨一頁。
    const last = m.pages.length - 1;
    m.pages.forEach((name, i) => {
      const d = document.createElement('div');
      d.className = 'page';
      if (i === 0 || i === last) d.dataset.density = 'hard';
      const img = document.createElement('img');
      img.dataset.src = BASE + name + '.webp';
      img.alt = m.title + ' 第 ' + (i + 1) + ' 頁';
      d.appendChild(img);
      bookEl.appendChild(d);
      imgs.push(img);
    });
    preload(0);

    $('total').textContent = m.pages.length;
    $('jumpInput').max = m.pages.length;
    fit();   // 先把容器尺寸算好，PageFlip 初始化時才量得到正確寬高

    pageFlip = new St.PageFlip(bookEl, {
      width: Math.round(MIN_PAGE_W),          // fixed 模式才用得到，這裡只是必填
      height: Math.round(MIN_PAGE_W / ratio),
      size: 'stretch',
      minWidth: MIN_PAGE_W,                   // ← 單頁/跨頁的門檻，見上方註解
      maxWidth: m.pageWidth,
      minHeight: Math.round(MIN_PAGE_W / ratio),
      maxHeight: m.pageHeight,
      autoSize: false,                        // 尺寸由 fit() 決定，不讓函式庫改容器
      usePortrait: true,                      // 允許切換成單頁（手機必要）
      showCover: true,                        // 封面、封底各自單獨一頁（需總頁數為偶數）
      flippingTime: isPhone ? 450 : 800,      // 手機快一點，等待感較低
      drawShadow: !isPhone,                   // 手機關陰影省效能
      maxShadowOpacity: 0.5,
      swipeDistance: isPhone ? 20 : 30,       // 預設 30 在小螢幕偏遲鈍
      /* 這個選項名稱和它的行為相反：設 true 時 touchmove 是 passive、
         不會 preventDefault，橫向位移超過 10px 才翻頁。
         也就是「手指在書上直向滑動時，外層 Google Sites 仍然捲得動」。 */
      mobileScrollSupport: true,
      /* 鎖住「點整本書就翻頁」，只留書角可點。
         否則第一次點擊就翻頁，雙擊放大永遠觸發不了。
         翻頁改用：滑動、書角、底部按鈕、鍵盤左右鍵。 */
      disableFlipByClick: true,
      useMouseEvents: true,
    });

    pageFlip.loadFromHTML(bookEl.querySelectorAll('.page'));
    $('loading').remove();

    const sync = () => {
      const i = pageFlip.getCurrentPageIndex();
      $('cur').textContent = i + 1;
      $('prev').disabled = i <= 0;
      $('next').disabled = i >= manifest.pages.length - 1;
      preload(i);
    };
    pageFlip.on('flip', sync);
    pageFlip.on('changeState', sync);
    sync();

    // 雙擊 / 雙指輕點兩下 → 放大目前這一頁
    bookEl.addEventListener('dblclick', () => openZoom(pageFlip.getCurrentPageIndex()));
    let lastTap = 0;
    bookEl.addEventListener('touchend', () => {
      const now = Date.now();
      if (now - lastTap < 320) openZoom(pageFlip.getCurrentPageIndex());
      lastTap = now;
    });

    $('prev').addEventListener('click', () => pageFlip.flipPrev());
    $('next').addEventListener('click', () => pageFlip.flipNext());
    $('zoomBtn').addEventListener('click', () => openZoom(pageFlip.getCurrentPageIndex()));

    $('jumpForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const n = parseInt($('jumpInput').value, 10);
      if (n >= 1 && n <= manifest.pages.length) pageFlip.turnToPage(n - 1);
      $('jumpInput').blur();
    });

    addEventListener('keydown', (e) => {
      if (!zoomBox.hidden || e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft')  pageFlip.flipPrev();
      if (e.key === 'ArrowRight') pageFlip.flipNext();
    });

    // 視窗尺寸改變、手機轉向都要重算。轉向後尺寸不會立刻更新，故延遲一次。
    addEventListener('resize', fit);
    addEventListener('orientationchange', () => setTimeout(fit, 250));
  })
  .catch(err => { $('loading').textContent = '載入失敗：' + err.message; });

/* 全螢幕：在 iframe 裡要外層加 allow="fullscreen" 才會成功。
   瀏覽器不給就直接把按鈕藏起來，不要留一顆按了沒反應的按鈕。 */
const fsBtn = $('fsBtn');
if (!document.fullscreenEnabled) {
  fsBtn.style.display = 'none';
} else {
  fsBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
}
