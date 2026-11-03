"""Сводка замеров «до» / «после»: python3 compare.py before/metrics.json variant-B/metrics.json"""
import json, sys
A = json.load(open(sys.argv[1])); B = json.load(open(sys.argv[2]))
def strip_off(v):
    if 'strip' in v: return round(v['strip']['cy'] - v['dock']['cy'], 1)
def close_off(v):
    if 'close' in v and 'strip' in v: return round(v['close']['cy'] - v['strip']['cy'], 1)
def mg(c):
    if 'markerGaps' in c: return c['markerGaps']
    # «до»: видимый промежуток между маркерами = зазор между чипами + чип − маркер
    return sorted({round(g + c['chipW'][0] - c['markers'][0]) for g in c['gaps']})
for k in A:
    a, b = A[k], B.get(k)
    if not b: continue
    line = f"{k:24s} dock h {a['dock']['h']:>5} -> {b['dock']['h']:>5}"
    if a.get('single'): line += f" | strip-dock {strip_off(a)} -> {strip_off(b)} | x-strip {close_off(a)} -> {close_off(b)}"
    line += f" | small {len(a['smallTargets'])}->{len(b['smallTargets'])} emoji {a['emojiMarkers']}->{b['emojiMarkers']}"
    print(line)
    for ca, cb in zip(a.get('cols', []), b.get('cols', [])):
        print(f"   {ca['cls'].split()[1]:10s} w {ca['w']}->{cb['w']} perRow {ca['perRow']}->{cb['perRow']} markerGap {mg(ca)}->{mg(cb)} "
              f"chipW {ca['chipW']}->{cb['chipW']} chipH {ca['chipH']}->{cb['chipH']} trunc {ca['truncated']}->{cb['truncated']}")
