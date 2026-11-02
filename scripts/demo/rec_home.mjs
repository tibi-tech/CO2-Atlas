import { session, sleep, BASE } from "./lib.mjs";

await session("home2", async (s) => {
  const { page } = s;
  // reproduce the data state of the original recording (run 15 still running, region 5 not yet created)
  await page.route(
    (u) => u.pathname === "/api/runs" || u.pathname === "/api/regions",
    async (route) => {
      const res = await route.fetch();
      const path = new URL(route.request().url()).pathname;
      let j = await res.json();
      if (path === "/api/runs") {
        j = j.filter((r) => r.id <= 15).map((r) => (r.id === 15 ? { ...r, status: "running", result: null } : r));
      } else {
        j = j.filter((r) => r.id <= 4);
      }
      await route.fulfill({ response: res, json: j });
    },
  );
  await page.reload();
  await sleep(2500);
  s.mark("home");
  await s.move("text=CO₂ absorbed by vegetation", { steps: 30 });
  await sleep(2500);
  await s.click(page.getByRole("button", { name: /^pt$/i }));
  s.mark("pt_click");
  await sleep(2800);
  await s.click(page.getByRole("button", { name: /^en$/i }));
  s.mark("en_click");
  await sleep(2500);
});
