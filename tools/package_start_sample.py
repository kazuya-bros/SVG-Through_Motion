"""Package an existing conversion as a portable, read-only onboarding template."""
import argparse
import base64
import json
import shutil
import urllib.request
from pathlib import Path

from psd_tools import PSDImage


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--project', required=True)
    parser.add_argument('--psd', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    source = root / 'data/projects' / args.project
    target = root / 'web/samples/teth'
    target.mkdir(parents=True, exist_ok=False)
    with urllib.request.urlopen('http://127.0.0.1:8765/api/projects/' + args.project) as r:
        project = json.load(r)
    def data(path):
        return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode()
    project['name'] = 'Teth2 · サンプル'
    project['sourceUrl'] = data(source / 'source.png')
    project.pop('reconstructedUrl', None)
    project['settings'].update(talking=True, renderSource='original', frontHair=2, backHair=4, armSwing=0)
    for part in project['parts']:
        part['originalUrl'] = data(source / part['original'])
        for key in ('svg', 'original'):
            part.pop(key, None)
    (target / 'project.json').write_text(json.dumps(project, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    shutil.copyfile(source / 'source.png', target / 'original.png')
    psd = PSDImage.open(args.psd)
    layers = []
    for i, (name, label) in enumerate([('front hair', '前髪'), ('irides-r', '瞳'), ('mouth', '口'), ('topwear', '服')]):
        layer = next(l for l in psd.descendants() if l.name == name)
        img = layer.composite()
        # Export the PSD layer's actual painted bounds, without resizing the artwork.
        bbox = img.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
        img.crop(bbox).save(target / f'layer-{i}.png')
        layers.append(dict(label=label, url=f'/web/samples/teth/layer-{i}.png'))
    manifest = dict(original='/web/samples/teth/original.png', project='/web/samples/teth/project.json', layers=layers)
    (target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (target / 'README.md').write_text('Teth2 sample\n\nUser-authorized illustration and See-Through parts.\nOriginal: Desktop/a.png. PSD: existing matching upload 2b1877505009438dac06bc00439c56d3.\nConverted with balanced VTracer and current hybrid processing.\nThe browser clones project.json with a fresh ID before editing.\n', encoding='utf-8')
    print('Packaged', sum(f.stat().st_size for f in target.iterdir()), 'bytes')


if __name__ == '__main__':
    main()
