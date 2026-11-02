"""Проверка целей нажатия карты через headless Edge/CDP (только localhost).

Из корня maap сначала запустить: python -m http.server 8765
Затем: python tools/ui_check.py [w=360,384,390] [out=папка] [--json [файл]]
Без out создаётся сохраняемая временная папка; --json без имени пишет report.json
в неё. Высота 800 CSS px, DPR 2, mobile=True, touch=True. Порт 9462,
профиль %TEMP%/edgeprofuicheck; не запускать два экземпляра одновременно.
Нужны штатный Edge и соседние phone-bench/cdp.py, tools/ship-shots/killedge.py.

Восемь состояний на каждой ширине: карта, планшет, шторка, поиск, граф,
окна phenome/gilvi/story-1. Каждое состояние начинается с новой страницы.
Проверяются видимые кнопки и ссылки в #controls, .node-dock, .tabbar,
.p-menu, .p-search, а также крестики трёх окон: размер >=48x48 CSS px,
выход за viewport, hit-test в центре и у четырёх краёв (отступ 4 px),
пересечения ненаследующих друг друга целей. Текст статей не обходится.
Полностью скрытые стилями/предками и полностью обрезанные scroll-контейнером
цели пропускаются; перекрытые другими элементами цели проверяются.
JSON содержит все прямоугольники, hit-test, нарушения, ошибки страницы.
Таблица содержит и прошедшие цели (OK). Нарушений N — число отдельных
проблем, включая ошибки сценариев/страницы; пересечение пары считается раз.
Коды выхода: 0 — чисто, 1 — нарушения или неполный прогон, 2 — неверные аргументы.
Это эмуляция Edge: клавиатура телефона и safe area Telegram не воспроизводятся.
"""

import argparse
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time


PORT = 9462
PROFILE = 'edgeprofuicheck'
EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
URL = 'http://localhost:8765/index.html'
STATES = ('map', 'planshet', 'menu', 'search', 'graph', 'phenome', 'gilvi', 'story-1')
INIT = r"""
window.__errs = [];
addEventListener('error', e => window.__errs.push(String(e.message || 'resource error')),
                 true);
addEventListener('unhandledrejection', e =>
  window.__errs.push(String(e.reason && e.reason.stack || e.reason)));
try { localStorage.clear(); localStorage.setItem('galaxyMapTourSeen', '1'); } catch (_) {}
"""

AUDIT = r"""
const scopes = '#controls, .node-dock, .tabbar, .p-menu, .p-search';
const targets = 'button, a[href], [role="button"], [role="tab"], summary, ' +
                'input[type="button"], input[type="submit"], input[type="reset"]';
const label = e => {
  if (!e) return '(none)';
  const id = e.id ? '#' + e.id : e.tagName.toLowerCase() +
    [...e.classList].map(c => '.' + c).join('');
  const text = (e.getAttribute('aria-label') || e.innerText ||
                e.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return id + (text ? ' [' + text + ']' : '');
};
function visible(e) {
  const r = e.getBoundingClientRect();
  if (!r.width || !r.height || !e.getClientRects().length) return false;
  // Keep off-screen targets so viewport overflow is reported. Only suppress
  // elements fully clipped by an explicit scrolling/clipping ancestor.
  for (let a = e; a; a = a.parentElement) {
    const s = getComputedStyle(a);
    if (s.display === 'none' || s.visibility === 'hidden' ||
        s.visibility === 'collapse' || Number(s.opacity) === 0) return false;
    if (a !== e && a !== document.body && a !== document.documentElement) {
      const p = a.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX) &&
          (r.right <= p.left || r.left >= p.right)) return false;
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY) &&
          (r.bottom <= p.top || r.top >= p.bottom)) return false;
    }
  }
  return true;
}
const candidates = new Set();
document.querySelectorAll(scopes).forEach(s => {
  if (s.matches(targets)) candidates.add(s);
  s.querySelectorAll(targets).forEach(e => candidates.add(e));
});
document.querySelectorAll('#phenomOverlay .toolbar-close-btn, ' +
  '#storyOverlay .toolbar-close-btn, #charOverlay .toolbar-close-btn')
  .forEach(e => candidates.add(e));
const elements = [...candidates].filter(visible);
const buttons = elements.map((e, index) => {
  const r = e.getBoundingClientRect();
  const rect = Object.fromEntries(['x','y','width','height','top','right','bottom','left']
    .map(k => [k, r[k]]));
  const problems = [];
  if (r.width < 48 || r.height < 48) problems.push('size < 48x48');
  if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
    problems.push('outside viewport');
  const x = r.left + r.width/2, y = r.top + r.height/2;
  const dx = Math.min(4, r.width/2), dy = Math.min(4, r.height/2);
  const hits = [['center',x,y], ['left',r.left+dx,y], ['right',r.right-dx,y],
                ['top',x,r.top+dy], ['bottom',x,r.bottom-dy]].map(([point,x,y]) => {
    const hit = document.elementFromPoint(x,y);
    return {point,x,y,ok: !!hit && (e === hit || e.contains(hit)), hit: label(hit)};
  });
  const missed = hits.filter(h => !h.ok);
  if (missed.length) problems.push('hit-test: ' +
    missed.map(h => h.point + ' -> ' + h.hit).join(', '));
  return {index,element:label(e),rect,hits,problems};
});
const overlaps = [];
for (let i=0; i<buttons.length; ++i) for (let j=i+1; j<buttons.length; ++j) {
  if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
  const a=buttons[i].rect, b=buttons[j].rect;
  const width=Math.min(a.right,b.right)-Math.max(a.left,b.left);
  const height=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
  if (width > 0 && height > 0) {
    overlaps.push({first:i,second:j,width,height});
    buttons[i].problems.push('overlap: ' + buttons[j].element +
      ' (' + width.toFixed(2) + 'x' + height.toFixed(2) + ')');
  }
}
return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},buttons,overlaps};
"""


class Browser:
    def __init__(self, ws):
        self.ws = ws

    def call(self, method, params=None):
        return self.ws.call(method, params)

    def js(self, body):
        result = self.call('Runtime.evaluate', {
            'expression': '(async () => {' + body + '})()',
            'awaitPromise': True, 'returnByValue': True, 'timeout': 15000,
        })
        if 'exceptionDetails' in result:
            detail = result['exceptionDetails']
            raise RuntimeError(detail.get('exception', {}).get('description')
                               or detail.get('text', 'JavaScript exception'))
        return result.get('result', {}).get('value')

    def wait(self, expression, timeout=20):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.js('return !!(' + expression + ');'):
                return
            time.sleep(0.15)
        raise RuntimeError('Timeout waiting for ' + expression)

    def click(self, selector):
        self.js('const e=document.querySelector(' + json.dumps(selector) + ');'
                'if(!e) throw Error("Missing scenario control"); e.click();')

    def settle(self):
        self.js('if(document.fonts) await document.fonts.ready;'
                'await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));')
        time.sleep(1.2)

    def prepare(self, width, state):
        self.call('Emulation.setDeviceMetricsOverride', {
            'width': width, 'height': 800, 'deviceScaleFactor': 2, 'mobile': True,
        })
        self.call('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 5})
        nav = self.call('Page.navigate', {'url': URL + '?ui_check=' + str(time.time_ns())})
        if nav.get('errorText'):
            raise RuntimeError(nav['errorText'])
        self.wait('document.readyState === "complete" && '
                  '!!document.querySelector("#controls") && !!window.__mapOpenRecord')
        self.wait('!document.querySelector("#splash")')
        self.click('[data-view="map"]')
        self.settle()
        if state in ('planshet', 'menu', 'search', 'graph'):
            self.click('[data-view="nodes"]')
            self.wait('document.body.classList.contains("planshet-on") && '
                      '!!document.querySelector("#planshet .p-menu")')
            self.settle()
            if state == 'menu':
                self.click('#planshetBrand')
                self.wait('!!document.querySelector("#planshet .p-menu:not([hidden])")')
            elif state == 'search':
                self.click('#planshetSearch')
                self.wait('!!document.querySelector("#planshet .p-search:not([hidden])")')
            elif state == 'graph':
                self.click('#sortToggle')
                self.wait('!document.body.classList.contains("planshet-on") && '
                          '!!document.querySelector("svg.nodes-mode")')
        elif state != 'map':
            self.js('const ok=await window.__mapOpenRecord(' + json.dumps(state) + ');'
                    'if(ok===false) throw Error("Record did not open");')
            # Сюжет, открытый сам по себе, ложится в нижний слой (#phenomOverlay), поверх Фенома — в верхний.
            overlay = {'phenome': '#phenomOverlay.open', 'gilvi': '#charOverlay.open',
                       'story-1': '#phenomOverlay.open, #storyOverlay.open'}[state]
            self.wait('!!document.querySelector(' + json.dumps(overlay) + ')')
        self.settle()


def arguments():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('settings', nargs='*', metavar='w=360,384,390 / out=folder')
    parser.add_argument('--json', nargs='?', const='', metavar='FILE')
    args = parser.parse_args()
    settings = {}
    for item in args.settings:
        key, sep, value = item.partition('=')
        if not sep or key not in ('w', 'out') or not value or key in settings:
            parser.error('Ожидаются w=360,384,390 и/или out=папка (без повторов)')
        settings[key] = value
    try:
        widths = list(dict.fromkeys(int(w) for w in settings.get('w', '360,384,390').split(',')))
        if any(w < 1 or w > 4096 for w in widths):
            raise ValueError
    except ValueError:
        parser.error('Ширины должны быть целыми числами 1..4096 через запятую')
    out = Path(settings['out']) if 'out' in settings else Path(tempfile.mkdtemp(prefix='ui-check-'))
    out.mkdir(parents=True, exist_ok=True)
    json_path = None if args.json is None else (Path(args.json) if args.json else out / 'report.json')
    return widths, out.resolve(), json_path


def check_state(browser, width, state, out):
    result = {'width': width, 'state': state, 'buttons': [], 'overlaps': [],
              'page_errors': [], 'scenario_errors': [], 'screenshot': None}
    try:
        browser.prepare(width, state)
        result.update(browser.js(AUDIT))
        if not result['buttons']:
            result['scenario_errors'].append('No visible audit targets: state is not verified')
    except Exception as exc:
        result['scenario_errors'].append(str(exc))
    # Preserve evidence even when opening the requested state failed.
    try:
        result['page_errors'] = browser.js('return window.__errs || [];')
    except Exception as exc:
        result['scenario_errors'].append('Read page errors: ' + str(exc))
    try:
        shot = out / f'{width}-{state}.png'
        data = browser.call('Page.captureScreenshot', {
            'format': 'png', 'captureBeyondViewport': False,
        })['data']
        shot.write_bytes(base64.b64decode(data))
        result['screenshot'] = str(shot)
    except Exception as exc:
        result['scenario_errors'].append('Screenshot: ' + str(exc))
    return result


def print_state(result):
    count = 0
    prefix = f"{result['width']} | {result['state']}"
    for button in result['buttons']:
        rect = button['rect']
        size = f"{rect['width']:.2f}x{rect['height']:.2f}"
        problems = button['problems']
        count += len(problems)
        print(f"{prefix} | {button['element']} | {size} | {'; '.join(problems) or 'OK'}")
    for kind in ('page_errors', 'scenario_errors'):
        for error in result[kind]:
            print(f"{prefix} | {kind} | - | {' '.join(str(error).split())}")
            count += 1
    return count


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    widths, out, json_path = arguments()
    report = {'url': URL, 'widths': widths, 'height': 800, 'dpr': 2,
              'mobile': True, 'touch': True, 'states': [], 'run_errors': []}
    proc = None
    ws = None
    killer = None
    print('Снимки: ' + str(out))
    print('Ширина | Состояние | Элемент | Размер CSS px | Проблема')
    try:
        # Do not attach to or kill an already running checker.
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', PORT)) == 0:
                raise RuntimeError(f'CDP port {PORT} is already in use')
        os.environ['CDP_PORT'] = str(PORT)
        os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
        sys.dont_write_bytecode = True
        project = Path(__file__).resolve().parents[2]
        sys.path.insert(0, str(project / 'phone-bench'))
        sys.path.insert(0, str(project / 'tools' / 'ship-shots'))
        import cdp
        import killedge
        killer = killedge
        proc = subprocess.Popen([
            str(EDGE), '--headless=new', f'--remote-debugging-port={PORT}',
            '--user-data-dir=' + str(Path(tempfile.gettempdir()) / PROFILE),
            '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
            '--window-size=390,800', 'about:blank',
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 15
        while True:
            if proc.poll() is not None:
                raise RuntimeError('Edge exited before CDP was ready')
            try:
                if any(t.get('type') == 'page' for t in cdp.targets()):
                    ws = cdp.page()
                    ws.s.settimeout(25)
                    break
            except (OSError, ValueError):
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Edge CDP startup timeout')
            time.sleep(0.2)
        browser = Browser(ws)
        for domain in ('Page', 'Runtime', 'Network'):
            browser.call(domain + '.enable')
        browser.call('Network.setCacheDisabled', {'cacheDisabled': True})
        browser.call('Page.addScriptToEvaluateOnNewDocument', {'source': INIT})
        for width in widths:
            for state in STATES:
                result = check_state(browser, width, state, out)
                result['violation_count'] = print_state(result)
                report['states'].append(result)
                sys.stdout.flush()
    except Exception as exc:
        report['run_errors'].append(str(exc))
    finally:
        if ws is not None:
            ws.s.close()
        if proc is not None:
            try:
                proc.terminate()
            except OSError:
                pass
            try:
                killer.kill(PROFILE)
                proc.wait(timeout=10)
            except Exception as exc:
                report['run_errors'].append('Edge cleanup: ' + str(exc))
    report['violation_count'] = sum(s['violation_count'] for s in report['states']) + len(report['run_errors'])
    report['complete'] = len(report['states']) == len(widths) * len(STATES)
    for error in report['run_errors']:
        print('RUN ERROR | ' + error)
    if json_path is not None:
        try:
            json_path.parent.mkdir(parents=True, exist_ok=True)
            json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            print('JSON: ' + str(json_path.resolve()))
        except OSError as exc:
            report['violation_count'] += 1
            print('JSON ERROR | ' + str(exc))
    print('нарушений ' + str(report['violation_count']))
    return 1 if report['violation_count'] or not report['complete'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
