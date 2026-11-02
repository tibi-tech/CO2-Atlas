import { chromium } from "playwright";
import fs from "node:fs";

export const BASE = "http://localhost:8000";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR = () => {
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText =
      "position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
    c.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 19 3-8 8-3z" fill="#1d3527" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    const st = document.createElement("style");
    st.textContent =
      "@keyframes __rip{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(1.6);opacity:0}}";
    document.documentElement.appendChild(st);
    addEventListener(
      "mousemove",
      (e) => (c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 3}px)`),
      true,
    );
    addEventListener(
      "mousedown",
      (e) => {
        const r = document.createElement("div");
        r.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:60px;height:60px;border-radius:50%;background:rgba(185,213,49,.55);border:2px solid #b9d531;z-index:2147483646;pointer-events:none;animation:__rip .55s ease-out forwards`;
        document.documentElement.appendChild(r);
        setTimeout(() => r.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mk);
  else mk();
};

export const CARD = (kind) => {
  const html = {
    title: `<div style="font:600 26px 'IBM Plex Mono',monospace;letter-spacing:.2em;color:#4a7c2a;margin-bottom:28px">CO₂ ABSORPTION CALCULATOR</div>
      <div style="font:600 112px/1.05 Fraunces,serif;color:#1d3527;text-align:center">Vegetation is a<br><span style="color:#4a7c2a">carbon sink.</span></div>
      <div style="font:italic 500 64px Fraunces,serif;color:#3f5a45;margin-top:18px">Measure it from space.</div>`,
    end: `<svg width="110" height="110" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1d3527"/><path d="M9 23c0-8 5-13 15-14-1 9-6 14-14 14" fill="#b9d531"/><path d="M9 23l8-8" stroke="#1d3527" stroke-width="1.6" stroke-linecap="round"/></svg>
      <div style="font:600 96px Fraunces,serif;color:#1d3527;margin-top:26px">CO₂ Atlas</div>
      <div style="font:500 34px 'Instrument Sans',sans-serif;color:#3f5a45;margin-top:14px">Open source · Sentinel-2 · ESA WorldCover · NASA POWER</div>
      <div style="font:600 34px 'IBM Plex Mono',monospace;color:#1d3527;margin-top:48px;padding:14px 28px;border:2px solid #1d3527;border-radius:999px">github.com/tibi-tech/CO2-Absorption-Calculator</div>`,
  }[kind];
  const d = document.createElement("div");
  d.id = "__card";
  d.style.cssText =
    "position:fixed;inset:0;z-index:2147483645;background:radial-gradient(circle at 80% 0%,#e4ecc0 0%,#ecead9 45%,#e6e3d0 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .8s";
  d.innerHTML = html;
  document.documentElement.appendChild(d);
  requestAnimationFrame(() => requestAnimationFrame(() => (d.style.opacity = "1")));
};

export async function session(name, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => localStorage.getItem("i18nextLng") || localStorage.setItem("i18nextLng", "en"));
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const marks = {};
  let t0 = 0;
  const api = {
    page,
    marks,
    mark: (k) => {
      marks[k] = (Date.now() - t0) / 1000;
      console.log(`[${name}] ${k} @ ${marks[k].toFixed(1)}s`);
    },
    async move(target, opts = {}) {
      const box = await (typeof target === "string" ? page.locator(target).first() : target).boundingBox();
      const x = box.x + box.width * (opts.fx ?? 0.5);
      const y = box.y + box.height * (opts.fy ?? 0.5);
      await page.mouse.move(x, y, { steps: opts.steps ?? 28 });
      return { x, y };
    },
    async click(target, opts = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await loc.scrollIntoViewIfNeeded();
      await api.move(loc, opts);
      await sleep(250);
      await loc.click();
    },
    async scroll(dy, steps = 30, ms = 30) {
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, dy / steps);
        await sleep(ms);
      }
    },
  };
  await page.goto(BASE + "/");
  await page.waitForTimeout(800);
  fs.mkdirSync("out", { recursive: true });
  await page.screencast.start({ path: `out/${name}.webm`, size: { width: 1920, height: 1080 }, quality: 100 });
  t0 = Date.now();
  try {
    await fn(api);
  } finally {
    await page.screencast.stop();
    fs.writeFileSync(`out/${name}.json`, JSON.stringify(marks, null, 2));
    await ctx.close();
    await browser.close();
  }
}
