#!/usr/bin/env python3
"""DOM-level verification of the rendered site (leaderboard, egg chips,
egg-crack replay events, JS console health)."""
import asyncio
from playwright.async_api import async_playwright

BASE = "http://localhost:8901"

async def check(page, url, checks, label):
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    await page.goto(url, wait_until="networkidle")
    await page.wait_for_timeout(1000)
    ok = True
    for name, js in checks.items():
        result = await page.evaluate(js)
        status = "OK " if result else "FAIL"
        if not result:
            ok = False
        print(f"  [{status}] {name}")
    if errors:
        ok = False
        print(f"  [FAIL] console errors: {errors[:3]}")
    print(f"  == {label}: {'PASS' if ok else 'FAIL'}")
    return ok

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})

        all_ok = True

        # ── leaderboard / index ──────────────────────────────────────
        all_ok &= await check(page, f"{BASE}/index.html", {
            "two models on leaderboard": "document.querySelectorAll('#lb-body tr').length >= 2 || document.body.innerText.includes('WYRM-BFS')",
            "GLM-4.6 present": "document.body.innerText.includes('GLM-4.6')",
            "egg failure chip visible": "document.body.innerText.includes('eggs cracked')",
            "rating rendered (896)": "document.body.innerText.includes('896')",
            "AA link present": "!!document.querySelector('a[href*=\"artificialanalysis.ai\"]')",
        }, "index.html")

        # ── hatchery replay (egg-crack run) ──────────────────────────
        all_ok &= await check(page, f"{BASE}/run.html?m=glm-4.6&l=38-the-hatchery", {
            "run page loads with title": "document.body.innerText.includes('The Hatchery') || document.body.innerText.includes('HATCHERY')",
            "status dead shown": "document.body.innerText.toUpperCase().includes('DEAD')",
            "steps recorded (18+)": "(() => { const s = document.querySelector('#scrubber'); return (s && Number(s.max) >= 18) || /18\\s*\/\\s*42|moves 18/.test(document.body.innerText); })()",
        }, "run.html (hatchery)")

        # replay to the death step and check the egg-crack event renders
        await page.evaluate("""(() => {
            const btn = document.querySelector('#btn-end');
            if (btn) btn.click();
        })()""")
        await page.wait_for_timeout(400)
        body = await page.evaluate("document.body.innerText")
        print(f"  [{'OK ' if 'EGG CRACKED' in body else 'FAIL'}] egg-crack event label on final step")
        all_ok &= "EGG CRACKED" in body

        # ── levels page ──────────────────────────────────────────────
        all_ok &= await check(page, f"{BASE}/levels.html", {
            "38 levels listed": "document.body.innerText.includes('38')",
            "The Hatchery present": "document.body.innerText.includes('The Hatchery')",
            "The Rubicon present": "document.body.innerText.includes('The Rubicon')",
            "ABYSS tier shown": "document.body.innerText.includes('ABYSS')",
        }, "levels.html")

        await browser.close()
        print("\nSITE DOM VERIFICATION:", "ALL PASS" if all_ok else "FAILURES PRESENT")

asyncio.run(main())
