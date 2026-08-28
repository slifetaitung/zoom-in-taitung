# -*- coding: utf-8 -*-
"""
產生翻頁書要用的 manifest.json。

翻頁書的頁序規則（實體書怎麼排，這裡就怎麼排）：
    cover（封面） → p001…pNNN（內頁） → back（封底）
總頁數必須是偶數，showCover 才能讓封面、封底各自單獨一頁。

用法（在「電子書」資料夾下執行）：
    python tools/make_manifest.py docs/pages/vol2 "Zoom in Taitung vol.2" 2021

※ 本工具「不會」產生可下載的 PDF。翻頁書刻意不提供整本下載，
  避免整本刊物被輕易轉存（版權考量）。
"""
import sys, os, json, glob


def ordered(dirpath):
    """回傳依實體書順序排好的頁面代號。檔名補零過，一般 sort 即正確順序。"""
    inner = sorted(os.path.basename(f)[:-5]
                   for f in glob.glob(os.path.join(dirpath, "p*.webp")))
    names = []
    if os.path.exists(os.path.join(dirpath, "cover.webp")):
        names.append("cover")
    names += inner
    if os.path.exists(os.path.join(dirpath, "back.webp")):
        names.append("back")
    return names


if __name__ == "__main__":
    dirpath, title, issue = sys.argv[1], sys.argv[2], sys.argv[3]
    names = ordered(dirpath)
    if len(names) % 2:
        raise SystemExit("總頁數 %d 是奇數，翻頁書封底會跟內頁擠在同一跨頁。"
                         "請在內頁最後補一張空白頁。" % len(names))

    manifest = {
        "title": title,
        "issue": issue,
        "pageWidth": 1462,      # 單頁圖片像素，給 StPageFlip 算長寬比用
        "pageHeight": 2000,
        "pages": names,
    }
    with open(os.path.join(dirpath, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print("頁數 %d（偶數 OK）" % len(names))
