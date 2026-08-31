#!/usr/bin/env python3
"""HTML アーティファクトの構造を機械的に検査する。

usage: python3 scripts/qa_html.py <file.html>
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}


class Checker(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append("L%d: </%s> に対応する開始タグがない"
                               % (self.getpos()[0], tag))
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        top = self.stack[-1]
        self.errors.append("L%d: </%s> と未閉の <%s> (L%d) が不一致"
                           % (self.getpos()[0], tag, top[0], top[1]))
        self.stack.pop()


def main():
    path = Path(sys.argv[1])
    src = path.read_text()
    print("%s: %d bytes / %d lines" % (path.name, len(src), src.count("\n") + 1))

    # 1. タグの入れ子（script/style の中身は除外）
    stripped = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", r"<\1></\1>", src,
                      flags=re.S | re.I)
    ck = Checker()
    ck.feed(stripped)
    for tag, line in ck.stack:
        ck.errors.append("L%d: <%s> が閉じられていない" % (line, tag))
    if ck.errors:
        print("  [TAG] 不整合:")
        for e in ck.errors:
            print("   -", e)
    else:
        print("  [TAG] 入れ子 OK")

    # 2. 目次リンクと section id の整合性
    nav = re.findall(r'<li><a href="#([\w-]+)"', src)
    sec = re.findall(r'<section id="([\w-]+)"', src)
    miss = [n for n in nav if n not in sec]
    orph = [s for s in sec if s not in nav]
    msg = "  [NAV] 目次 %d / section %d" % (len(nav), len(sec))
    if miss:
        msg += " — リンク先不在: %s" % miss
    if orph:
        msg += " — 目次に無い section: %s" % orph
    if not miss and not orph:
        msg += " — OK"
    print(msg)

    # 3. ページ内アンカーの到達性
    anchors = set(re.findall(r'href="#([\w-]+)"', src))
    ids = set(re.findall(r'id="([\w-]+)"', src))
    dead = sorted(a for a in anchors if a not in ids)
    print("  [ANCHOR] " + ("リンク切れ: %s" % dead if dead else "全アンカー到達可 OK"))

    # 4. 外部リンクの rel/target
    ext = re.findall(r'<a[^>]*href="(https?://[^"]+)"', src)
    blank_no_rel = re.findall(r'<a[^>]*target="_blank"(?![^>]*rel=)[^>]*>', src)
    hosts = sorted(set(re.sub(r"^https?://([^/]+).*", r"\1", u) for u in ext))
    print("  [LINK] 外部リンク %d 件 / ホスト: %s" % (len(ext), ", ".join(hosts)))
    print("  [LINK] " + ("rel=noopener 欠落 %d 件" % len(blank_no_rel)
                         if blank_no_rel else "target=_blank は全件 rel 付き OK"))

    # 5. 機密情報の流出
    bad = [p for p in ("CLIENT_SECRET=", "SESSION_SECRET=", "38Hfx7",
                       "3ba6f490", "kabua2ademo") if p in src]
    print("  [SECRET] " + ("流出検出: %s" % bad if bad else "流出なし OK"))

    # 6. コンテンツ量
    print("  [COUNT] コピー対象ブロック %d / シナリオ %d / チェック項目 %d"
          % (src.count('class="cmd-b"'),
             len(re.findall(r"\{id:\"\d-[A-F]\"", src)),
             len(re.findall(r'^      \["', src, re.M))))

    print("  => " + ("NG" if (ck.errors or miss or dead or bad) else "PASS"))


if __name__ == "__main__":
    main()
