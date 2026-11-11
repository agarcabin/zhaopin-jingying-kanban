"""Prepare an independently hosted copy, preserving the user's source data."""
import hashlib
import json
import re
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SHARE = 'https://workbuddy.link/p/TLnwVZuv6cHmuRsWtXp5eK?ext2=copy_link'
CHART = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js'

def download(url):
    with urlopen(url, timeout=45) as response:
        return response.read()

def main():
    share = download(SHARE).decode('utf-8')
    versions = set(re.findall(r'https://workbuddy-space-static\.codebuddy\.work/page/TLnwVZuv6cHmuRsWtXp5eK/[\w-]+/', share))
    if len(versions) != 1:
        raise RuntimeError('Unexpected share page: expected one published version')
    source = versions.pop() + 'index.html'
    html = download(source).decode('utf-8').replace('\r\n', '\n').replace('\r', '')
    marker = 'window.__DATA__ = '
    start = html.index(marker) + len(marker)
    data, _ = json.JSONDecoder().raw_decode(html[start:])
    # Keep the original data block intact, including candidate names.
    # Remove WorkBuddy's editor/host integration; the dashboard's own scripts remain.
    html, count = re.subn(r'<script\b[^>]*\bsrc=["\']/page/page_comm/inject\.js["\'][^>]*>\s*</script>', '', html, flags=re.I)
    if count != 1:
        raise RuntimeError('Unexpected source: expected one platform loader')
    if CHART not in html:
        raise RuntimeError('Unexpected chart dependency')
    html = html.replace(CHART, '../assets/echarts.min.js')
    for directory in ('embeds', 'assets'):
        (ROOT / directory).mkdir(exist_ok=True)
    (ROOT / 'embeds/dashboard.html').write_text(html, encoding='utf-8', newline='\n')
    chart = download(CHART)
    if not chart or b'echarts' not in chart[:10000].lower():
        raise RuntimeError('Unexpected chart download')
    (ROOT / 'assets/echarts.min.js').write_bytes(chart)
    (ROOT / 'assets/ECHARTS-LICENSE.txt').write_bytes(download('https://cdn.jsdelivr.net/npm/echarts@5.5.0/LICENSE'))
    manifest = {'source_url': source, 'snapshot_generated_at': data['meta']['generated_at'],
                'latest_report': data['meta']['latest_report'], 'candidate_names_anonymized': 0,
                'candidate_names_preserved': True,
                'chart_version': '5.5.0', 'chart_sha256': hashlib.sha256(chart).hexdigest(),
                'changes': ['preserve original candidate names and statistics', 'remove platform editor loader', 'host chart dependency locally']}
    (ROOT / 'embeds/source.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'prepared': 'embeds/dashboard.html', 'candidate_names_preserved': True, 'records': len(data['invite_records']), 'latest_report': data['meta']['latest_report']}))

if __name__ == '__main__':
    main()
