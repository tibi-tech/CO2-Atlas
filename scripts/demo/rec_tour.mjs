import { session, sleep, BASE, CARD } from "./lib.mjs";

await session("tour", async (s) => {
  const { page } = s;
  // home
  await page.goto(BASE + "/");
  await sleep(1500);
  s.mark("home");
  await s.move("text=CO₂ absorbed by vegetation", { steps: 30 });
  await sleep(2500);
  await s.click(page.getByRole("button", { name: /^pt$/i }));
  await sleep(2800);
  await s.click(page.getByRole("button", { name: /^en$/i }));
  await sleep(1800);
  await s.scroll(560, 30);
  await sleep(1500);
  s.mark("regions_list");
  await s.move("a:has-text('Oeiras')", { steps: 30 });
  await sleep(1800);
  s.mark("oeiras_click");
  await s.click("a:has-text('Oeiras')");
  await page.waitForURL(/\/regions\/1$/);
  await sleep(2500);
  s.mark("oeiras_page");
  await s.scroll(520, 30);
  await sleep(1500);
  s.mark("thesis_hover");
  await s.move("text=Thesis method >> nth=-1", { steps: 30 });
  await sleep(2500);
  await s.click("text=June 2024 >> nth=0");
  await sleep(500);
  s.mark("oeiras_improved");
  await page.waitForURL(/\/runs\/\d+$/);
  await sleep(3500);
  await page.goBack();
  await sleep(1500);
  await s.scroll(520, 20);
  await s.click(page.locator("a:has-text('June 2024'):has-text('Thesis')").first());
  await page.waitForURL(/\/runs\/\d+$/);
  await sleep(4000);
  s.mark("oeiras_thesis");
  // method page
  await s.click(page.getByRole("link", { name: "Method", exact: true }).first());
  await page.waitForURL(/\/about$/);
  await sleep(2500);
  s.mark("method");
  await s.scroll(900, 60, 40);
  await sleep(2500);
  await s.scroll(900, 60, 40);
  await sleep(2500);
  s.mark("method_end");
});

await session("cards", async (s) => {
  const { page } = s;
  await page.evaluate(CARD, "title");
  await sleep(7000);
  s.mark("title_end");
  await page.evaluate(() => document.getElementById("__card").remove());
  await page.evaluate(CARD, "end");
  await sleep(9000);
  s.mark("end_end");
});

