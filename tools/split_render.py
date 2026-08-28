# -*- coding: utf-8 -*-
"""
把《Zoom in Taitung》的印刷版 PDF 轉成翻頁書要用的單頁圖片。

做的事：
  1. 依 TrimBox 裁掉 3mm 出血（印刷版邊緣的出血轉圖後會變黑線）
  2. 內頁若是跨頁檔（版面寬 > 高）自動沿正中線切成左右兩個單頁；
     已經是單頁的檔案（如 vol.2）就原樣輸出，不必改程式碼
  3. 書封檔是「封底｜書背｜封面」攤平的三合一，扣掉書背後拆成兩張
  4. 渲染成 2000px WebP + JPEG 備援（翻頁顯示用）
     與 3000px JPEG（雙擊放大用），全部嵌入 sRGB 描述檔

用法（在「電子書」資料夾下執行）：
    python tools/split_render.py pages "生活誌vol2_OK_1018更新.pdf" out/vol2
    python tools/split_render.py cover "生活誌書封_vol2-1012OK.pdf"  out/vol2

新增一期時只要換檔名與輸出資料夾，不必改程式碼。
"""
import sys, os
import fitz                      # PyMuPDF：讀 PDF、渲染
from PIL import Image, ImageCms  # Pillow：壓縮、寫 sRGB 描述檔

# ── 輸出規格（對應 CLAUDE.md 的「圖片規格」表）───────────────────
DISPLAY_PX = 2000   # 翻頁書顯示用，長邊像素
ZOOM_PX    = 3000   # 雙擊放大用，長邊像素
QUALITY    = 82

# 單頁成品寬度（190mm）。書封要靠它反推書背寬度：
#   書背 = 書封總寬 - 封面寬 - 封底寬
PAGE_W_PT = 190 / 25.4 * 72      # = 538.58 pt

# sRGB 描述檔：壓縮時中繼資料會被清掉，這裡主動補回去，
# 否則 Safari 會用螢幕原生色域顯示，照片會偏艷。
SRGB_BYTES = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def render(page, clip, long_px):
    """把 page 的 clip 區域渲染成指定長邊像素的 PIL Image。"""
    # 縮放倍率 = 目標像素 / clip 高度（1pt = 1px 時為 1 倍）。
    # 不用 get_pixmap 的 dpi 參數，因為它只吃整數，湊不到精確長邊。
    z = long_px / clip.height
    pm = page.get_pixmap(matrix=fitz.Matrix(z, z), clip=clip, colorspace=fitz.csRGB)
    return Image.frombytes("RGB", (pm.width, pm.height), pm.samples)


def _fit(img, long_px):
    if img.height <= long_px:
        return img
    return img.resize((round(img.width * long_px / img.height), long_px), Image.LANCZOS)


def save_pair(img, outdir, name):
    """存一組：顯示用 WebP + JPEG 備援，放大用 JPEG。"""
    disp = _fit(img, DISPLAY_PX)
    disp.save(os.path.join(outdir, name + ".webp"), "WEBP",
              quality=QUALITY, method=4, icc_profile=SRGB_BYTES)
    disp.save(os.path.join(outdir, name + ".jpg"), "JPEG",
              quality=QUALITY, optimize=True, progressive=True, icc_profile=SRGB_BYTES)
    _fit(img, ZOOM_PX).save(os.path.join(outdir, name + "@zoom.jpg"), "JPEG",
              quality=QUALITY, optimize=True, progressive=True, icc_profile=SRGB_BYTES)
    return disp.size


def do_pages(src, outdir):
    """內頁：跨頁自動切半，單頁原樣。輸出 p001…pNNN（補零，一般 sort 即正確順序）。"""
    doc = fitz.open(src)
    idx = 0
    for pno, page in enumerate(doc):
        page.set_cropbox(page.trimbox)          # 去出血
        r = page.rect
        if r.width > r.height:                  # 橫向 = 跨頁，沿裝訂摺線切半
            mid = r.x0 + r.width / 2
            clips = [fitz.Rect(r.x0, r.y0, mid, r.y1),
                     fitz.Rect(mid, r.y0, r.x1, r.y1)]
        else:
            clips = [r]
        for c in clips:
            idx += 1
            w, h = save_pair(render(page, c, ZOOM_PX), outdir, "p%03d" % idx)
            print("  p%03d  <- PDF p.%d  %dx%d" % (idx, pno + 1, w, h), flush=True)
    print("內頁完成：%d 頁" % idx, flush=True)
    return idx


def do_cover(src, outdir):
    """書封：扣掉中間書背，左半 = 封底、右半 = 封面。"""
    page = fitz.open(src)[0]
    page.set_cropbox(page.trimbox)
    r = page.rect
    spine = r.width - 2 * PAGE_W_PT             # 書背寬度
    print("  書封總寬 %.1fmm，推得書背 %.1fmm"
          % (r.width / 72 * 25.4, spine / 72 * 25.4), flush=True)
    if spine < -1:
        raise SystemExit("書封比兩個單頁還窄，請確認這是攤平的封面+書背+封底檔")
    back  = fitz.Rect(r.x0, r.y0, r.x0 + PAGE_W_PT, r.y1)   # 封底
    front = fitz.Rect(r.x1 - PAGE_W_PT, r.y0, r.x1, r.y1)   # 封面
    for clip, name in ((front, "cover"), (back, "back")):
        w, h = save_pair(render(page, clip, ZOOM_PX), outdir, name)
        print("  %-5s %dx%d" % (name, w, h), flush=True)


if __name__ == "__main__":
    mode, src, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(outdir, exist_ok=True)
    (do_pages if mode == "pages" else do_cover)(src, outdir)
