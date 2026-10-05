#!/usr/bin/env python3
"""
Builds the invoice fonts offered in the generator's font picker
(src/assets/invoice-fonts/), from the families' upstream releases in the
google/fonts repository (all under the SIL Open Font License).

For each family it writes a regular and a semibold instance, subset to the
characters Folio's PDF fonts cover (Latin-1, punctuation, € ₹ − →):
  <id>-regular.woff2, <id>-semibold.woff2   for the screen and print
  <id>-regular.ttf,   <id>-semibold.ttf     embedded in PDFs (jsPDF needs TrueType)
Both formats come from the same instance, so the PDF has the exact metrics the
preview was laid out with. Prints the metrics core/fonts.js uses to size each
family against the templates' own fonts.

  python3 tools/make-invoice-fonts.py <directory with the upstream .ttf files>
Requires fontTools (+ brotli for WOFF2).
"""
import json, os, sys, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'invoice-fonts')
SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
RAW = 'https://raw.githubusercontent.com/google/fonts/main/ofl'

# id, family, upstream dir, file(s), axes for regular/semibold
FAMILIES = [
    ('inter', 'Inter', 'inter', 'inter.ttf', {'opsz': 14}),
    ('ibm-plex-sans', 'IBM Plex Sans', 'ibmplexsans', 'ibmplexsans.ttf', {'wdth': 100}),
    ('source-serif', 'Source Serif 4', 'sourceserif4', 'sourceserif4.ttf', {'opsz': 12}),
    ('libre-baskerville', 'Libre Baskerville', 'librebaskerville', 'librebaskerville.ttf', {}),
    ('lora', 'Lora', 'lora', 'lora.ttf', {}),
    ('crimson-pro', 'Crimson Pro', 'crimsonpro', 'crimsonpro.ttf', {}),
    ('dm-sans', 'DM Sans', 'dmsans', 'dmsans.ttf', {'opsz': 12}),
    ('work-sans', 'Work Sans', 'worksans', 'worksans.ttf', {}),
    ('manrope', 'Manrope', 'manrope', 'manrope.ttf', {}),
    ('jetbrains-mono', 'JetBrains Mono', 'jetbrainsmono', 'jetbrainsmono.ttf', {}),
    ('ibm-plex-mono', 'IBM Plex Mono', 'ibmplexmono', ('ibmplexmono-regular.ttf', 'ibmplexmono-semibold.ttf'), {}),
]
WEIGHTS = {'regular': 400, 'semibold': 600}

# The characters of Folio's existing PDF fonts, plus the arrow used on payment buttons.
base = TTFont(os.path.join(ROOT, 'src', 'assets', 'pdf-fonts', 'serif-regular.ttf'))
UNICODES = sorted(set(base.getBestCmap().keys()) | {0x20B9, 0x2192, 0x2212, 0x20AC})
FEATURES = ['kern', 'liga', 'calt', 'lnum', 'pnum', 'tnum', 'case', 'ccmp', 'locl', 'mark', 'mkmk']

def instance(path, axes, weight):
    f = TTFont(path)
    if 'fvar' not in f:
        return f
    limits = {a.axisTag: (a.minValue, a.maxValue) for a in f['fvar'].axes}
    loc = {}
    for tag, (lo, hi) in limits.items():
        want = weight if tag == 'wght' else axes.get(tag)
        if want is None:
            continue
        loc[tag] = max(lo, min(hi, want))
    return instancer.instantiateVariableFont(f, loc, updateFontNames=False)

def rename(f, family, sub):
    """Static names (an instance keeps the variable font's default names otherwise)."""
    name = f['name']
    for nid in (16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    ps = family.replace(' ', '') + '-' + sub
    for nid, value in ((1, family), (2, sub), (3, f'Folio subset;{ps}'), (4, f'{family} {sub}'), (6, ps)):
        name.setName(value, nid, 3, 1, 0x409)
        name.setName(value, nid, 1, 0, 0)
    f['OS/2'].usWeightClass = 400 if sub == 'Regular' else 600
    f['OS/2'].fsSelection = (f['OS/2'].fsSelection & ~0b1100001) | (0b1000000 if sub == 'Regular' else 0)
    f['head'].macStyle = 0

def metrics(f):
    cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; hmtx = f['hmtx']
    avg = lambda s: sum(hmtx[cmap[ord(c)]][0] for c in s if ord(c) in cmap) / len(s) / upm
    os2 = f['OS/2']
    return {
        'xHeight': round(getattr(os2, 'sxHeight', 0) / upm, 4),
        'capHeight': round(getattr(os2, 'sCapHeight', 0) / upm, 4),
        'digit': round(avg('0123456789'), 4),
        'lower': round(avg('abcdefghijklmnopqrstuvwxyz'), 4),
    }

def main():
    os.makedirs(OUT, exist_ok=True)
    report = {}
    for fid, family, updir, files, axes in FAMILIES:
        for style, weight in WEIGHTS.items():
            src = os.path.join(SRC, files[0] if style == 'regular' else files[1]) if isinstance(files, tuple) else os.path.join(SRC, files)
            f = instance(src, axes, weight)
            opts = subset.Options()
            opts.layout_features = FEATURES
            opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
            opts.hinting = False
            opts.notdef_outline = True
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=UNICODES)
            sub.subset(f)
            rename(f, family, 'Regular' if style == 'regular' else 'SemiBold')
            f.flavor = None
            f.save(os.path.join(OUT, f'{fid}-{style}.ttf'))
            f.flavor = 'woff2'
            f.save(os.path.join(OUT, f'{fid}-{style}.woff2'))
            if style == 'regular':
                f.flavor = None
                report[fid] = {'family': family, **metrics(TTFont(os.path.join(OUT, f'{fid}-regular.ttf')))}
        lic = os.path.join(OUT, f'OFL-{family.replace(" ", "-")}.txt')
        if not os.path.exists(lic):
            urllib.request.urlretrieve(f'{RAW}/{updir}/OFL.txt', lic)
    for ref, path in [('eb-garamond', 'serif-regular.ttf'), ('hanken-grotesk', 'sans-regular.ttf')]:
        report[ref] = {'family': ref, **metrics(TTFont(os.path.join(ROOT, 'src', 'assets', 'pdf-fonts', path)))}
    print(json.dumps(report, indent=1))

main()
