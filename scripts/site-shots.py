#!/usr/bin/env python3
"""Screenshot key site pages for visual verification."""
import asyncio
from playwright.async_api import async_playwright

PAGES = [
    ("http://localhost:8901/index.html", "/tmp/render/site-index.png"),
    ("http://localhost:8901/run.html?run=glm-4.6__38-the-hatchery", "/tmp/render/site-run-hatchery.png"),
    ("http://localhost:8901/levels.html", "/tmp/render/site-levels.png"),
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        for url, out in PAGES:
            await page.goto(url, wait_until="networkidle")
            await page.wait_for_timeout(1200)
            await page.screenshot(path=out)
            print("shot:", out)
        await browser.close()

asyncio.run(main())
