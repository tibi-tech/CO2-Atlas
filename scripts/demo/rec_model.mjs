import { session, sleep, BASE } from "./lib.mjs";

const SCHEDULE = [
  [0.0, 4.2, [576, 296, 768, 140]],
  [4.24, 6.4, [576, 477, 768, 89]],
  [6.4, 8.6, [576, 566, 768, 89]],
  [8.69, 9.7, [576, 655, 768, 89]],
  [9.7, 10.6, [576, 744, 768, 89]],
  [10.6, 12.6, [576, 833, 768, 68]],
  [12.71, 15.4, [820, 374, 280, 36]],
];

await session("model", async (s) => {
  const { page } = s;
  await page.goto(BASE + "/about");
  await sleep(1500);
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "__hl";
    d.style.cssText =
      "position:fixed;z-index:99999;pointer-events:none;border:4px solid #b9d531;border-radius:14px;box-shadow:0 0 0 9999px rgba(29,53,39,.18),0 0 28px rgba(185,213,49,.8);transition:all .45s ease;opacity:0";
    document.body.appendChild(d);
  });
  s.mark("sync0");
  const t0 = Date.now();
  for (const [from, to, [x, y, w, h]] of SCHEDULE) {
    const wait = from * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    await page.evaluate(([x, y, w, h]) => {
      const d = document.getElementById("__hl");
      d.style.opacity = "1";
      Object.assign(d.style, { left: x - 6 + "px", top: y - 6 + "px", width: w + 12 + "px", height: h + 12 + "px" });
    }, [x, y, w, h]);
  }
  await sleep(Math.max(0, 15.5 * 1000 - (Date.now() - t0)));
  await page.evaluate(() => (document.getElementById("__hl").style.opacity = "0"));
  await sleep(600);
});
