"""Build contact sheets from a visual sweep and flag areas that read badly.

Run after tools/visual-sweep.mjs:

    python3 tools/contact-sheet.py [--dir sweep]

Produces sheet-play.png and sheet-wide.png, and prints a luminance table. A mean
luminance under about 12 means the area is too dark to navigate, which is how the
unlit caves were caught.

Brightness alone does not say an area reads badly: a snowfield is meant to be bright,
and a flat bright ceiling caught the snow areas while their drifts, tents and fires
were perfectly legible. What actually reads badly is a bright frame with nothing in
it, so the second flag wants a high mean AND a low spread.
"""
import argparse
import json
import pathlib
import statistics

from PIL import Image, ImageDraw, ImageFont

DARK_FLOOR = 12.0
FLAT_MEAN = 150.0
FLAT_SPREAD = 20.0


def luminance(path: pathlib.Path) -> tuple[float, float]:
    grey = Image.open(path).convert('L')
    pixels = list(grey.get_flattened_data()) if hasattr(grey, "get_flattened_data") else list(grey.getdata())
    return round(statistics.fmean(pixels), 1), round(statistics.pstdev(pixels), 1)


def reads_badly(lum: float, spread: float) -> bool:
    return lum < DARK_FLOOR or (lum > FLAT_MEAN and spread < FLAT_SPREAD)


def sheet(files, out, cols=6, tw=300, th=282):
    pad, lab = 6, 22
    rows = (len(files) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (14, 20, 22))
    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    except OSError:
        font = ImageFont.load_default()
    for i, (name, path, lum) in enumerate(files):
        image = Image.open(path).convert('RGB')
        image.thumbnail((tw, th))
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + lab + pad)
        canvas.paste(image, (x, y))
        colour = (226, 138, 120) if reads_badly(*lum) else (190, 210, 208)
        draw.text((x + 2, y + image.height + 3), f'{name}  {lum[0]}', fill=colour, font=font)
    canvas.save(out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', type=pathlib.Path, default=pathlib.Path('sweep'))
    args = ap.parse_args()

    play, wide = [], []
    for path in sorted(args.dir.glob('*.png')):
        if path.name.startswith('sheet'):
            continue
        name = path.stem.replace('mountain_', '')
        row = (name.replace('wide_', ''), path, luminance(path))
        (wide if path.stem.startswith('wide_') else play).append(row)

    if not play:
        raise SystemExit(f'no screenshots in {args.dir}; run tools/visual-sweep.mjs first')

    # Named after the sweep, so a phone sweep does not overwrite the desktop sheets.
    suffix = '' if args.dir.name == 'sweep' else f'-{args.dir.name.removeprefix("sweep-")}'
    play_sheet = sheet(play, args.dir.parent / f'sheet-play{suffix}.png')
    wide_sheet = sheet(wide, args.dir.parent / f'sheet-wide{suffix}.png') if wide else None

    print(f'{"area":34s} play  spread    wide')
    flagged = []
    wide_by_name = {n: l for n, _, l in wide}
    for name, _, (lum, spread) in sorted(play, key=lambda r: r[2][0]):
        w = wide_by_name.get(name)
        note = ''
        if lum < DARK_FLOOR:
            note = '  TOO DARK'
            flagged.append(name)
        elif lum > FLAT_MEAN and spread < FLAT_SPREAD:
            note = '  BRIGHT AND EMPTY'
            flagged.append(name)
        wide_text = '-' if w is None else f'{w[0]:6.1f}'
        print(f'{name:34s} {lum:6.1f}  {spread:5.1f}  {wide_text}{note}')

    (args.dir / 'luminance.json').write_text(
        json.dumps(
            {'play': {n: {'mean': l[0], 'spread': l[1]} for n, _, l in play},
             'wide': {n: {'mean': l[0], 'spread': l[1]} for n, l in wide_by_name.items()}},
            indent=2)
    )
    print(f'\n{play_sheet} and {wide_sheet} written')
    if flagged:
        print(f'FLAGGED: {", ".join(flagged)}')


main()
