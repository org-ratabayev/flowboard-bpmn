#!/usr/bin/env python3
"""Download the bpmn-js plugins as browser ES modules from esm.sh into public/vendor/esm/.

npm is not used: esm.sh bundles each package for the browser, and this script
fetches every module the entries import (recursively) and rewrites the absolute
esm.sh import paths to relative local paths, so the app runs fully offline.

Shared packages are pinned via DEPS so that every plugin resolves the same
versions (one copy of preact, bpmn-js utilities, ...).

Usage: python3 scripts/vendor-plugins.py   (bump versions below and re-run to upgrade)
"""

import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'vendor', 'esm')
CDN = 'https://esm.sh'
UNPKG = 'https://unpkg.com'
TARGET = 'es2022'

DEPS = ','.join([
    'bpmn-js@18.31.0',
    'diagram-js@15.28.1',
    '@bpmn-io/properties-panel@3.58.1',
    'bpmnlint@12.0.0',
    'tiny-svg@4.1.4',
    'min-dom@5.3.0',
    'min-dash@5.1.0',
])

BPMNLINT = 'bpmnlint@12.0.0'
LINT_RULES = [
    'ad-hoc-sub-process', 'conditional-flows', 'end-event-required', 'event-based-gateway',
    'event-sub-process-typed-start-event', 'fake-join', 'global', 'label-required', 'link-event',
    'no-bpmndi', 'no-complex-gateway', 'no-disconnected', 'no-duplicate-sequence-flows',
    'no-gateway-join-fork', 'no-implicit-split', 'no-implicit-end', 'no-implicit-start',
    'no-inclusive-gateway', 'no-overlapping-elements', 'single-blank-start-event',
    'single-event-definition', 'start-event-required', 'sub-process-blank-start-event',
    'superfluous-gateway', 'superfluous-label', 'superfluous-termination',
]

# Packages taken as-is from unpkg instead of esm.sh. The properties panel ships its own
# preact whose entry points import each other relatively; esm.sh would build each entry
# point separately with its own inlined preact copy, which breaks hooks ("reading '__H'").
# name -> (version, {export subpath: file in package})
RAW_PACKAGES = {
    '@bpmn-io/properties-panel': ('3.58.1', {
        '.': 'dist/index.esm.js',
        './preact': 'preact/dist/preact.module.js',
        './preact/hooks': 'preact/hooks/dist/hooks.module.js',
        './preact/compat': 'preact/compat/dist/compat.module.js',
        './preact/jsx-runtime': 'preact/jsx-runtime/dist/jsxRuntime.module.js',
    }),
    'bpmn-js-properties-panel': ('5.65.3', {
        '.': 'dist/index.esm.js',
    }),
}

# local entry name -> raw package name (its '.' export)
RAW_ENTRIES = {
    'properties-panel': 'bpmn-js-properties-panel',
}

# local entry name -> esm.sh package specifier
ENTRIES = {
    'differ': 'bpmn-js-differ@3.2.0',
    'bpmnlint-plugin': 'bpmn-js-bpmnlint@0.25.0',
    'token-simulation': 'bpmn-js-token-simulation@1.1.0',
    'minimap': 'diagram-js-minimap@5.6.0',
    'auto-layout': 'bpmn-auto-layout@1.3.0',
    'bpmnlint-static-resolver': f'{BPMNLINT}/lib/resolver/static-resolver',
    **{f'bpmnlint-rules/{r}': f'{BPMNLINT}/rules/{r}' for r in LINT_RULES},
}

# local css path -> unpkg path
CSS = {
    'css/properties-panel.css': '@bpmn-io/properties-panel@3.58.1/dist/assets/properties-panel.css',
    'css/bpmn-js-bpmnlint.css': 'bpmn-js-bpmnlint@0.25.0/dist/assets/css/bpmn-js-bpmnlint.css',
    'css/bpmn-js-token-simulation.css': 'bpmn-js-token-simulation@1.1.0/assets/css/bpmn-js-token-simulation.css',
    'css/diagram-js-minimap.css': 'diagram-js-minimap@5.6.0/assets/diagram-js-minimap.css',
}

IMPORT_RE = re.compile(r'''((?:\bfrom|\bimport)\s*\(?\s*)(["'])((?:/|\./|\.\./)[^"'\s]+)\2''')
# static imports/exports only: skips `import('x')`, which in raw sources appears in JSDoc type comments
RAW_IMPORT_RE = re.compile(r'''(\bfrom\s*|\bimport\s+)(["'])([^"'\s]+)\2''')

PINNED = dict(d.rsplit('@', 1) for d in DEPS.split(','))


def fetch(url, attempts=6):
    # esm.sh builds on first request and may answer 408/5xx until the build is done
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (vendor-plugins)'})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode('utf-8')
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            status = getattr(e, 'code', None)
            if i == attempts - 1 or (status is not None and status not in (408, 429) and status < 500):
                raise RuntimeError(f'{url}: {e}') from e
            time.sleep(2 ** i)


def local_name(esm_path):
    """Map an esm.sh absolute path (maybe with query) to a safe relative file path."""
    path, _, query = esm_path.partition('?')
    path = path.replace('%20', '').replace('>=', 'gte-').replace('^', '').replace('~', '')
    path = re.sub(r'[^\w@.\-/]', '_', path).lstrip('/')
    if query:
        path += '__' + hashlib.sha1(query.encode()).hexdigest()[:8]
    if not path.endswith(('.mjs', '.js')):
        path += '.mjs'
    return path


def vendor(esm_path, seen):
    rel = local_name(esm_path)
    if rel in seen:
        return rel
    seen.add(rel)
    src = fetch(CDN + esm_path)
    file_dir = os.path.dirname(os.path.join(OUT, rel))

    def rewrite(m):
        dep = m.group(3)
        if dep.startswith('.'):
            # relative to this module's location on esm.sh
            dep = posixpath.normpath(posixpath.join(posixpath.dirname(esm_path.partition('?')[0]), dep))
        dep_rel = vendor(dep, seen)
        target = os.path.relpath(os.path.join(OUT, dep_rel), file_dir)
        if not target.startswith('.'):
            target = './' + target
        return f'{m.group(1)}{m.group(2)}{target}{m.group(2)}'

    src = IMPORT_RE.sub(rewrite, src)
    dest = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(src)
    return rel


def split_bare(spec):
    """'@scope/pkg/sub/path' -> ('@scope/pkg', './sub/path'); 'pkg' -> ('pkg', '.')"""
    parts = spec.split('/')
    n = 2 if spec.startswith('@') else 1
    name, sub = '/'.join(parts[:n]), '/'.join(parts[n:])
    return name, f'./{sub}' if sub else '.'


def relative_import(from_rel, to_rel):
    target = os.path.relpath(os.path.join(OUT, to_rel), os.path.dirname(os.path.join(OUT, from_rel)))
    return target if target.startswith('.') else './' + target


def vendor_raw(pkg, file, seen, ranges):
    """Vendor one file of a RAW_PACKAGES package from unpkg, resolving its imports."""
    version, exports = RAW_PACKAGES[pkg]
    rel = f'raw/{pkg}@{version}/{file}'
    if rel in seen:
        return rel
    seen.add(rel)
    if 'ranges' not in ranges.setdefault(pkg, {}):
        meta = json.loads(fetch(f'{UNPKG}/{pkg}@{version}/package.json'))
        ranges[pkg]['ranges'] = {**meta.get('dependencies', {}), **meta.get('peerDependencies', {})}
    by_dir = {sub[2:] if sub != '.' else '': f for sub, f in exports.items()}

    def resolve(spec):
        if spec.startswith('.'):
            target = posixpath.normpath(posixpath.join(posixpath.dirname(file), spec))
            if target in by_dir:
                return vendor_raw(pkg, by_dir[target], seen, ranges)
            return vendor_raw(pkg, target if target.endswith('.js') else target + '.js', seen, ranges)
        name, sub = split_bare(spec)
        if name in RAW_PACKAGES:
            return vendor_raw(name, RAW_PACKAGES[name][1][sub], seen, ranges)
        version_or_range = PINNED.get(name) or ranges[pkg]['ranges'].get(name)
        if not version_or_range:
            raise RuntimeError(f'{pkg}/{file}: no version known for import "{spec}"')
        # unbundled esm.sh modules, so packages shared between deps (e.g. @codemirror/state) load once
        return vendor(f'/{name}@{version_or_range}{sub[1:]}?target={TARGET}&deps={DEPS}', seen)

    src = fetch(f'{UNPKG}/{pkg}@{version}/{file}')
    src = re.sub(r'^//# sourceMappingURL=.*$', '', src, flags=re.M)
    src = RAW_IMPORT_RE.sub(lambda m: f'{m.group(1)}{m.group(2)}{relative_import(rel, resolve(m.group(3)))}{m.group(2)}', src)
    dest = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(src)
    return rel


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    seen = set()
    ranges = {}
    for name, pkg in RAW_ENTRIES.items():
        rel = vendor_raw(pkg, RAW_PACKAGES[pkg][1]['.'], seen, ranges)
        entry = os.path.join(OUT, 'entries', f'{name}.mjs')
        os.makedirs(os.path.dirname(entry), exist_ok=True)
        with open(entry, 'w', encoding='utf-8') as f:
            f.write(f'export * from "{relative_import(f"entries/{name}.mjs", rel)}";\n')
        print(f'  {name:40s} <- {pkg}@{RAW_PACKAGES[pkg][0]} (unpkg, unbundled)')
    for name, spec in ENTRIES.items():
        rel = vendor(f'/{spec}?bundle&target={TARGET}&deps={DEPS}', seen)
        entry = os.path.join(OUT, 'entries', f'{name}.mjs')
        os.makedirs(os.path.dirname(entry), exist_ok=True)
        target = os.path.relpath(os.path.join(OUT, rel), os.path.dirname(entry))
        src = fetch(f'{CDN}/{spec}?bundle&target={TARGET}&deps={DEPS}')
        has_default = re.search(r'export\s*\{\s*default\s*\}|export\s+default', src) is not None
        with open(entry, 'w', encoding='utf-8') as f:
            f.write(f'export * from "./{target}";\n')
            if has_default:
                f.write(f'export {{ default }} from "./{target}";\n')
        print(f'  {name:40s} <- {spec}')
    for rel, spec in CSS.items():
        dest = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(fetch(f'{UNPKG}/{spec}'))
    print(f'Vendored {len(seen)} modules and {len(CSS)} stylesheets into {OUT}')


if __name__ == '__main__':
    sys.exit(main())
