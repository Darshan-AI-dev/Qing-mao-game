"""Build a source bundle for handing the project to a collaborator.

Deliberately different from the previous starter's packager in one respect: the
chapter PDFs under source-reference/ are never included. Source text should not be
redistributed in a build artifact, and the previous starter ZIP shipped all four.

Python standard library only.

    python3 tools/package.py [--out Qing-Mao-Source.zip]
"""
import argparse
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

INCLUDE_DIRS = ['canon', 'engine', 'content', 'tools', 'tests', 'docs', 'public', '.github']
INCLUDE_FILES = [
    'README.md', 'index.html', 'style.css', 'package.json', 'package-lock.json',
    'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', '.gitignore',
]
# Never redistributed, whatever a caller asks for.
EXCLUDE_PARTS = {'node_modules', 'dist', 'dist-offline', 'test-results',
                 'playwright-report', 'source-reference', '.git'}
EXCLUDE_SUFFIXES = {'.pdf'}


def included(path: pathlib.Path) -> bool:
    rel = path.relative_to(ROOT)
    if EXCLUDE_PARTS & set(rel.parts):
        return False
    return path.suffix.lower() not in EXCLUDE_SUFFIXES


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=pathlib.Path, default=ROOT / 'Qing-Mao-Source.zip')
    args = ap.parse_args()

    count = 0
    with zipfile.ZipFile(args.out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in INCLUDE_FILES:
            path = ROOT / name
            if path.is_file():
                z.write(path, f'Qing-Mao-Rebirth/{name}')
                count += 1
        for directory in INCLUDE_DIRS:
            base = ROOT / directory
            if not base.is_dir():
                continue
            for path in sorted(base.rglob('*')):
                if path.is_file() and included(path):
                    z.write(path, f'Qing-Mao-Rebirth/{path.relative_to(ROOT)}')
                    count += 1

    # Fail loudly rather than shipping source text by accident.
    with zipfile.ZipFile(args.out) as z:
        leaked = [n for n in z.namelist()
                  if n.lower().endswith('.pdf') or 'source-reference' in n.lower()]
    if leaked:
        raise SystemExit(f'refusing to ship source text: {leaked}')

    size = args.out.stat().st_size
    print(f'{args.out}: {count} files, {size:,} bytes (no source text included)')


main()
