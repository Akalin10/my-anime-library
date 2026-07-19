import { expect, test } from "@playwright/test";

const title = "カウボーイビバップ";
const cardName = `查看 ${title} 详情`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const browserErrors = new WeakMap<object, string[]>();

test.describe.serial("第 16 轮关键流程", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      const location = message.location();
      const isAutomaticFavicon404 =
        location.url.endsWith("/favicon.ico") && message.text().includes("404");
      if (message.type() === "error" && !isAutomaticFavicon404) {
        errors.push(`console: ${message.text()}`);
      }
    });
  });

  test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) ?? []).toEqual([]);
  });

  test("1. 空数据库首页", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("你的动漫库还是空的。")).toBeVisible();
    await expect(page.getByRole("button", { name: "全部 0" })).toBeVisible();

    for (const viewport of [
      { width: 320, height: 720 },
      { width: 768, height: 900 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  });

  test("2. 搜索并导入", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ 添加动漫" }).click();
    await page.getByRole("searchbox", { name: "搜索外部动漫资料" }).fill("Cowboy Bebop");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    const directResult = page.locator("article").filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
    await expect(directResult).toBeVisible();
    await directResult.getByRole("checkbox", { name: "选择导入" }).check();
    await page.getByRole("button", { name: "导入选中作品" }).click();
    await expect(page.getByText("成功导入 1 部作品")).toBeVisible();
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(page.getByRole("button", { name: cardName })).toBeVisible();
  });

  test("3. 点击海报打开详情弹窗", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: cardName }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: title })).toBeVisible();
  });

  test("4. 关闭详情弹窗并恢复焦点", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("button", { name: cardName });
    const layoutBeforeOpen = await card.boundingBox();
    await card.click();
    await expect(page.getByRole("button", { name: "关闭动漫详情" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card).toBeFocused();
    expect(await card.boundingBox()).toEqual(layoutBeforeOpen);
  });

  test("5. 修改观看状态", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: cardName }).click();
    await page.locator("#anime-detail-status").selectOption("COMPLETED");
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "关闭动漫详情" }).click();
    await expect(page.getByRole("button", { name: cardName }).getByText("已看完", { exact: true })).toBeVisible();
  });

  test("6. 上传并替换封面", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: cardName }).click();
    await page.getByRole("button", { name: "更换封面" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "custom.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByRole("img", { name: `${title}封面预览` })).toBeVisible();
    await page.getByRole("button", { name: "确认保存" }).click();
    await expect(page.getByRole("heading", { name: `更换《${title}》封面` })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("img", { name: `${title}海报` })).toHaveAttribute(
      "src",
      /\/api\/posters\/custom\//,
    );
  });

  test("7. 恢复默认封面", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: cardName }).click();
    await page.getByRole("button", { name: "更换封面" }).click();
    await page.getByRole("button", { name: "恢复默认封面" }).click();
    await expect(page.getByRole("heading", { name: `更换《${title}》封面` })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("img", { name: `${title}海报` })).toHaveAttribute(
      "src",
      /\/api\/posters\/default\//,
    );
  });

  test("8. 删除动漫", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: cardName }).click();
    await page.getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("你的动漫库还是空的。")).toBeVisible();
  });

  test("9. 外部数据源失败时显示可重试提示", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "+ 添加动漫" }).click();
    await page.getByRole("searchbox", { name: "搜索外部动漫资料" }).fill("fail source");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(page.getByText("AniList 请求失败。")).toBeVisible();
    await expect(page.getByRole("button", { name: "重试 AniList" })).toBeVisible();
  });

  test("10. 重复导入被阻止", async ({ page }) => {
    const request = { status: "WATCHING", items: [{ source: "anilist", sourceId: "1", status: "WATCHING" }] };
    const first = await page.request.post("/api/anime/import", { data: request });
    expect(first.ok()).toBeTruthy();
    expect((await first.json()).data.successCount).toBe(1);

    const duplicate = await page.request.post("/api/anime/import", { data: request });
    expect(duplicate.ok()).toBeTruthy();
    const duplicateBody = await duplicate.json();
    expect(duplicateBody.data.failureCount).toBe(1);
    expect(duplicateBody.data.items[0].error.code).toBe("ALREADY_IMPORTED");

    const library = await page.request.get("/api/anime?status=ALL&sort=RECENT");
    expect(library.ok()).toBeTruthy();
    expect((await library.json()).data.counts.all).toBe(1);
  });
});
