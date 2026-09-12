"""Load the built page in a real browser and check it actually plays.

Catches the failures that a physics test cannot: a script that throws on load,
a readout wired to the wrong element, a rally loop that never advances.  Runs
the page headless for a few seconds, sweeps the pointer across the table so the
human paddle is doing something, and reports what the page says happened.

    python test_game.py --page ../flypong_game.html --shot /tmp/fly.png
"""

import argparse
import sys

from playwright.sync_api import sync_playwright

# The bundled browser lives under PLAYWRIGHT_BROWSERS_PATH, and its exact
# versioned directory moves; find it rather than hard-coding a build number.
def find_chromium():
    import glob as _g
    for pat in ('/opt/pw-browsers/chromium-*/chrome-linux/chrome',
                '/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell'):
        hits = sorted(_g.glob(pat))
        if hits:
            return hits[-1]
    return None


def main(page_path, seconds, shot, width, height):
    errors, logs = [], []
    with sync_playwright() as pw:
        exe = find_chromium()
        browser = pw.chromium.launch(**({'executable_path': exe} if exe else {}))
        page = browser.new_page(viewport={'width': width, 'height': height})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}')
                if m.type in ('error', 'warning') else None)

        page.goto(f'file://{page_path}')
        page.wait_for_timeout(1200)

        box = page.locator('#cv').bounding_box()
        steps = max(1, int(seconds * 10))
        for i in range(steps):
            # Sweep the paddle across the table so rallies can actually happen.
            frac = 0.5 + 0.42 * __import__('math').sin(i * 0.42)
            page.mouse.move(box['x'] + box['width'] * frac,
                            box['y'] + box['height'] * (0.60 + 0.16 * __import__('math').cos(i * 0.31)))
            page.wait_for_timeout(100)

        read = page.evaluate("""() => ({
            you: document.getElementById('pts-you').textContent,
            fly: document.getElementById('pts-fly').textContent,
            rally: document.getElementById('ro-rally').textContent,
            best: document.getElementById('ro-best').textContent,
            ret: document.getElementById('ro-ret').textContent,
            ball: document.getElementById('ro-ball').textContent,
            flyspeed: document.getElementById('ro-fly').textContent,
            elapsed: document.getElementById('hud-elapsed').textContent,
            spec: document.querySelectorAll('#spec div').length,
            nerve: document.getElementById('num0').textContent,
        })""")

        if shot:
            page.screenshot(path=shot, full_page=False)
        browser.close()

    print(f'score            {read["you"]} - {read["fly"]}')
    print(f'fly returns      {read["ret"]}')
    print(f'longest rally    {read["best"]}')
    print(f'ball speed       {read["ball"]}')
    print(f'fly airspeed     {read["flyspeed"]}')
    print(f'chamber clock    {read["elapsed"]}')
    print(f'spec rows        {read["spec"]}')
    print(f'policy output 0  {read["nerve"]}')
    if logs:
        print('\nconsole:')
        for line in logs[:10]:
            print('  ', line)
    if errors:
        print('\nPAGE ERRORS:')
        for e in errors[:5]:
            print('  ', e)
        return 1

    points = int(read['you']) + int(read['fly'])
    returns = int(read['ret'].split('/')[0])
    served = int(read['ret'].split('/')[1])
    problems = []
    if points == 0:
        problems.append('no points were scored -- the rally loop is not advancing')
    if served == 0:
        problems.append('no serves happened')
    if returns == 0:
        problems.append('the fly never returned a ball')
    if read['elapsed'] == '0.00 s':
        problems.append('the chamber clock never advanced')
    if read['spec'] != 8:
        problems.append(f'spec panel has {read["spec"]} rows, expected 8')

    print()
    if problems:
        for p in problems:
            print('FAIL:', p)
        return 1
    print(f'PASS -- {points} points played, fly returned {returns} of {served} serves')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--page', default='/home/user/p95/flypong_game.html')
    ap.add_argument('--seconds', type=float, default=25)
    ap.add_argument('--shot', default='')
    ap.add_argument('--width', type=int, default=1280)
    ap.add_argument('--height', type=int, default=900)
    a = ap.parse_args()
    sys.exit(main(a.page, a.seconds, a.shot, a.width, a.height))
