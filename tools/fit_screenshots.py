#!/usr/bin/env python3
"""App Store の 6.9インチ枠（1290x2796）に合わせて書き出す。

App Store Connect は寸法とアルファチャンネルを厳しく見る。
- 寸法が1pxでも違うと弾かれる
- 透過が残っていると弾かれる

比率が違う画像は、切らずに余白を足して合わせる。
広告用の画像は上部にコピーが乗っているので、
はみ出しを切ると文字が欠ける。余白は端の色から拾って継ぎ目を目立たせない。

    python3 tools/fit_screenshots.py screenshots
"""
import sys, os
from PIL import Image

W, H = 1290, 2796
SRC = sys.argv[1] if len(sys.argv) > 1 else 'screenshots'
OUT = os.path.join(SRC, 'out')


def edge_color(im: Image.Image) -> tuple:
    """上下の端1行の平均。余白をここで塗ると継ぎ目が出にくい。"""
    w, h = im.size
    top = im.crop((0, 0, w, 1)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    bottom = im.crop((0, h - 1, w, h)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return tuple((a + b) // 2 for a, b in zip(top, bottom))


def fit(path: str, dst: str) -> str:
    im = Image.open(path).convert('RGB')
    w, h = im.size
    if (w, h) == (W, H):
        im.save(dst, optimize=True)
        return 'そのまま'
    # 収まるように縮小・拡大してから余白を足す（切らない）
    sc = min(W / w, H / h)
    nw, nh = max(1, round(w * sc)), max(1, round(h * sc))
    resized = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), edge_color(resized))
    canvas.paste(resized, ((W - nw) // 2, (H - nh) // 2))
    canvas.save(dst, optimize=True)
    pad = f'左右{(W - nw) // 2}px' if nw < W else f'上下{(H - nh) // 2}px'
    return f'{w}x{h} -> {nw}x{nh} に収めて {pad} 余白'


def main() -> None:
    if not os.path.isdir(SRC):
        print(f'{SRC} が見つかりません'); return
    os.makedirs(OUT, exist_ok=True)
    files = sorted(f for f in os.listdir(SRC)
                   if f.lower().endswith(('.png', '.jpg', '.jpeg')))
    if not files:
        print(f'{SRC} に画像がありません'); return
    for i, f in enumerate(files, 1):
        dst = os.path.join(OUT, f'{i:02d}_{os.path.splitext(f)[0]}.png')
        print(f'{f:32} {fit(os.path.join(SRC, f), dst)}')
    print(f'\n{len(files)}枚を {OUT} に書き出しました（{W}x{H} / 透過なし）')


if __name__ == '__main__':
    main()
