# -*- coding: utf-8 -*-
"""Convert source illustrations to WebP at shipping size.

The review measured 24 MB of art and ~4 MB transferred before first play. Converting
to WebP at a 1600 px cap brings the whole set to roughly 2-3 MB, which is what keeps
the first playable moment inside the 10 MB budget.

Usage:  python3 tools/optimise-art.py <source-dir> [--max-width 1600] [--quality 82]
"""
import argparse, json, pathlib, sys
from PIL import Image

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source', type=pathlib.Path)
    ap.add_argument('--out', type=pathlib.Path, default=pathlib.Path('art'))
    ap.add_argument('--max-width', type=int, default=1600)
    ap.add_argument('--quality', type=int, default=82)
    args = ap.parse_args()

    if not args.source.is_dir():
        sys.exit(f'{args.source} is not a directory')
    args.out.mkdir(parents=True, exist_ok=True)

    before = after = 0
    rows = []
    for path in sorted(args.source.iterdir()):
        if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
            continue
        source_bytes = path.stat().st_size
        image = Image.open(path).convert('RGB')
        if image.width > args.max_width:
            height = round(image.height * args.max_width / image.width)
            image = image.resize((args.max_width, height), Image.LANCZOS)
        target = args.out / (path.stem + '.webp')
        image.save(target, 'WEBP', quality=args.quality, method=6)
        out_bytes = target.stat().st_size
        before += source_bytes
        after += out_bytes
        rows.append({'source': path.name, 'out': target.name, 'bytes': out_bytes,
                     'width': image.width, 'height': image.height})
        print(f'{path.name:32s} {source_bytes/1e6:6.2f} MB -> {target.name:28s} {out_bytes/1e6:5.2f} MB')

    report = {'files': rows, 'sourceBytes': before, 'outBytes': after,
              'ratio': round(after / before, 4) if before else 0}
    (args.out / 'optimisation-report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'\ntotal {before/1e6:.2f} MB -> {after/1e6:.2f} MB ({after/before*100:.1f}%)' if before else 'nothing to do')

main()
