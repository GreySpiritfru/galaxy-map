"""Карта в Edge без окна, экран телефона: шаги (JS) и снимки (02.11.2026, Claude).
Нужен сервер: python -m http.server 8765 в корне maap. Edge после работы закрывается (профиль edgeprofplan во временной папке).
argv: steps.json out_dir [w=390] [h=844] [dpr=2] [mobile=1] [q=параметры адреса]
steps.json: [{"js": "...", "wait": 1.5, "shot": "имя"}, ...] — js выполняется как тело async-функции."""
import base64, json, os, subprocess, sys, tempfile, time
os.environ['CDP_PORT'] = '9461'
sys.path.insert(0, r'D:\neiro\phenomemap\phone-bench'); sys.path.insert(0, r'D:\neiro\phenomemap\tools\ship-shots')
import cdp, killedge
sys.stdout.reconfigure(encoding='utf-8')
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
HERE = tempfile.gettempdir()
steps = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]; os.makedirs(out, exist_ok=True)
args = dict(a.split('=', 1) for a in sys.argv[3:] if '=' in a)
W, H = int(args.get('w', 390)), int(args.get('h', 844))
proc = subprocess.Popen([EDGE, '--headless=new', '--remote-debugging-port=9461', f'--user-data-dir={HERE}\\edgeprofplan',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', f'--window-size={W},{H}', 'about:blank'],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2.5); ws = cdp.page(); n = [0]
def call(m, p=None):
    n[0] += 1; ws.send({'id': n[0], 'method': m, 'params': p or {}})
    while True:
        r = ws.recv()
        if r.get('id') == n[0]:
            if 'error' in r: raise RuntimeError(r['error'])
            return r.get('result', {})
def js(c):
    r = call('Runtime.evaluate', {'expression': '(async () => {' + c + '})()', 'awaitPromise': True, 'returnByValue': True})
    return r.get('result', {}).get('value') if 'exceptionDetails' not in r else r['exceptionDetails'].get('exception', {}).get('description')
try:
    call('Page.enable'); call('Runtime.enable'); call('Network.enable'); call('Network.setCacheDisabled', {'cacheDisabled': True})
    call('Page.addScriptToEvaluateOnNewDocument', {'source': 'window.__errs=[];addEventListener("error",e=>__errs.push(String(e.message)));addEventListener("unhandledrejection",e=>__errs.push(String(e.reason&&e.reason.stack||e.reason)));try{localStorage.setItem("galaxyMapTourSeen","1")}catch(e){}'})
    call('Emulation.setDeviceMetricsOverride', {'width': W, 'height': H, 'deviceScaleFactor': float(args.get('dpr', 2)), 'mobile': args.get('mobile', '1') == '1'})
    call('Emulation.setTouchEmulationEnabled', {'enabled': True})
    call('Page.navigate', {'url': 'http://localhost:8765/index.html?' + args.get('q', '') + '&' + str(time.time())})
    for _ in range(300):
        time.sleep(0.1)
        if js('return !!document.querySelector("#controls") && !!window.__mapOpenRecord'): break
    time.sleep(2)
    for i, st in enumerate(steps):
        if st.get('js'):
            res = js(st['js'])
            if res is not None: print(i, json.dumps(res, ensure_ascii=False))
        time.sleep(st.get('wait', 1))
        if st.get('shot'):
            data = call('Page.captureScreenshot', {'format': 'png'})['data']
            open(os.path.join(out, st['shot'] + '.png'), 'wb').write(base64.b64decode(data))
    print('errs', js('return window.__errs'))
finally:
    proc.terminate(); killedge.kill('edgeprofplan')
