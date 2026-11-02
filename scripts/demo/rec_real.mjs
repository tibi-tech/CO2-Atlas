import { session, sleep, BASE, CARD } from "./lib.mjs";

await session("real", async (s) => {
  const { page } = s;
  await page.goto(BASE + "/regions/new");
  await page.waitForTimeout(2500);
  s.mark("new_start");

  // search a place
  const search = page.locator("form input").first();
  await s.click(search);
  await page.keyboard.type("Seixal, Setúbal, Portugal", { delay: 70 });
  await sleep(500);
  await page.keyboard.press("Enter");
  await page.waitForSelector("ul button");
  await sleep(1200);
  await s.click(page.locator("ul button").first());
  s.mark("picked");
  await sleep(3500);

  // tour of the drawing tools
  for (const label of ["Polygon", "Rectangle", "Upload file"]) {
    await s.move(page.getByRole("button", { name: label }), { steps: 20 });
    await sleep(900);
  }

  // form
  await s.click("#region-pop");
  await page.keyboard.type("166693", { delay: 90 });
  await sleep(500);
  await s.click("#region-pc");
  await page.keyboard.type("0.40", { delay: 120 });
  await sleep(1200);
  s.mark("form_filled");
  await s.click(page.getByRole("button", { name: "Create region" }));
  await page.waitForURL(/\/regions\/\d+$/);
  await sleep(2500);
  s.mark("region_page");

  // run form
  await s.click(page.getByRole("button", { name: "Sept", exact: true }));
  await sleep(1200);
  await s.click(page.getByRole("button", { name: "Advanced model settings" }));
  await sleep(2500);
  await s.scroll(300, 20);
  await sleep(2000);
  await s.click(page.getByRole("button", { name: "Advanced model settings" }));
  await sleep(800);
  await s.scroll(-1000, 20);
  await sleep(600);
  s.mark("before_submit");
  await s.click(page.getByRole("button", { name: /Calculate 1 month/ }));
  await page.waitForURL(/\/runs\/\d+$/);
  const runId = page.url().split("/").pop();
  s.mark("submitted");
  console.log("run", runId);

  // wait for processing
  const t = Date.now();
  let status = "";
  while (Date.now() - t < 25 * 60 * 1000) {
    const r = await (await page.request.get(`${BASE}/api/runs/${runId}`)).json();
    if (r.status !== status) {
      status = r.status;
      console.log("status", status, Math.round((Date.now() - t) / 1000) + "s");
    }
    if (status === "done" || status === "failed") break;
    await page.screenshot({ path: "out/progress_last.png" });
    await sleep(3000);
  }
  if (status !== "done") throw new Error("run " + status);
  s.mark("processing_done");
  await sleep(3500);
  s.mark("results_shown");

  // dashboard hover over stat cards
  await s.move("text=CO₂ absorbed by vegetation", { steps: 25 });
  await sleep(2500);
  await s.scroll(420, 25);
  await sleep(1500);
  s.mark("atlas_start");

  // atlas layers
  for (const l of ["NPP (carbon)", "NDVI", "FPAR", "Water stress", "Land cover", "CO₂ absorbed"]) {
    await s.click(page.getByRole("button", { name: l, exact: true }));
    await sleep(2200);
  }
  // click a pixel
  const map = page.locator(".maplibregl-canvas").first();
  const mb = await map.boundingBox();
  await s.click(map, { fx: 0.5, fy: 0.45 });
  await sleep(2500);
  await s.click(page.getByRole("button", { name: "Satellite" }));
  await sleep(3500);
  await s.click(page.getByRole("button", { name: "Satellite" }));
  await sleep(1500);
  s.mark("atlas_end");

  // breakdown + exports
  await s.scroll(900, 40);
  await sleep(3500);
  s.mark("breakdown");
  await s.scroll(-1500, 40);
  await sleep(800);
  for (const l of ["PDF report", "CSV table", "GeoTIFF layers"]) {
    await s.move(page.getByRole("link", { name: l }), { steps: 22 });
    await sleep(1000);
  }
  s.mark("exports");
  await sleep(1500);
});
