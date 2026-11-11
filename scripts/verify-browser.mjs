import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, firefox, webkit } from "playwright";
import AxeBuilder from "@axe-core/playwright";

async function assertAccessible(page, name) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  if (result.violations.length) {
    throw new Error(`Accessibility ${name}: ${JSON.stringify(result.violations.map((item) => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })))}`);
  }
}

async function assertGuideCloseClearance(guideDialog, name) {
  const [closeBox, imageBox] = await Promise.all([
    guideDialog.getByRole("button", { name: "Закрыть", exact: true }).boundingBox(),
    guideDialog.locator(".guide-image").boundingBox(),
  ]);
  if (!closeBox || !imageBox) throw new Error(`Guide close/image is not measurable: ${name}`);
  const overlaps = closeBox.x < imageBox.x + imageBox.width
    && closeBox.x + closeBox.width > imageBox.x
    && closeBox.y < imageBox.y + imageBox.height
    && closeBox.y + closeBox.height > imageBox.y;
  if (overlaps) throw new Error(`Guide close button overlaps the image: ${name}`);
}

async function assertGuideImageFit(imageViewer, name) {
  const dimensions = await imageViewer.locator("[data-guide-image-viewport]").evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  if (dimensions.scrollWidth > dimensions.clientWidth + 1 || dimensions.scrollHeight > dimensions.clientHeight + 1) {
    throw new Error(`Guide image does not fit at 100%: ${name}: ${JSON.stringify(dimensions)}`);
  }
}

function rectanglesOverlap(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

async function captureGuideImages(page, name) {
  if (process.env.CAPTURE_GUIDE_IMAGES !== "1") return;
  const directory = path.resolve("public/images/guide");
  await fs.mkdir(directory, { recursive: true });
  const sourceContext = page.context();
  const browser = sourceContext.browser();
  if (!browser) throw new Error("A browser is required to capture guide images");
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
    storageState: await sourceContext.storageState(),
  });
  const capturePage = await context.newPage();
  try {
    await capturePage.goto(page.url(), { waitUntil: "networkidle" });
    for (const [theme, label, suffix] of [["light", "Светлая", ""], ["dark", "Тёмная", "-dark"]]) {
      await capturePage.getByRole("button", { name: /Тема оформления:/ }).click();
      await capturePage.getByRole("menuitemradio", { name: label, exact: true }).click();
      await capturePage.waitForFunction((expected) => document.documentElement.classList.contains("dark") === (expected === "dark"), theme);
      await capturePage.waitForTimeout(350);
      await capturePage.screenshot({ path: path.join(directory, `${name}${suffix}.jpg`), type: "jpeg", quality: 95, fullPage: false, scale: "device" });
    }
  } finally {
    await context.close();
  }
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function assertPracticalFeatureHints(page, name) {
  const count = await page.locator("[data-feature-hint]").count();
  if (!count) throw new Error(`No feature hints found: ${name}`);
  const reviewed = [];

  for (let index = 0; index < count; index++) {
    const trigger = page.locator("[data-feature-hint]").nth(index);
    const label = await trigger.getAttribute("aria-label");
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const content = page.locator('[data-feature-hint-content][data-state="open"]');
    await content.waitFor();
    const text = normalizedText(await content.locator("p").innerText());
    if (text.length < 100) throw new Error(`Hint is not sufficiently practical: ${name} / ${label}`);
    const duplicate = await trigger.evaluate((element, hintText) => {
      const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
      const container = element.closest("header, section");
      if (!container) return false;
      return [...container.querySelectorAll("p")].some((paragraph) => normalize(paragraph.textContent) === hintText);
    }, text);
    if (duplicate) throw new Error(`Hint duplicates the visible description: ${name} / ${label}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Hint causes horizontal overflow: ${name} / ${label}`);
    reviewed.push(label);
    await page.keyboard.press("Escape");
    await content.waitFor({ state: "hidden" });
  }

  console.log(`Practical hints ${name}: ${reviewed.length}`);
  return reviewed;
}

async function assertToastLayout(page, output, name) {
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Настройки и валютные курсы сохранены" }).last();
  const icon = toast.locator("[data-icon]");
  const title = toast.locator("[data-title]");
  const close = toast.getByRole("button", { name: "Закрыть уведомление", exact: true });
  await close.waitFor();
  await page.waitForTimeout(450);
  const [iconBox, titleBox, closeBox] = await Promise.all([icon.boundingBox(), title.boundingBox(), close.boundingBox()]);
  if (!iconBox || !titleBox || !closeBox) throw new Error(`Toast elements are not measurable: ${name}`);
  if (rectanglesOverlap(iconBox, closeBox)) throw new Error(`Toast icon overlaps the close button: ${name}`);
  if (rectanglesOverlap(titleBox, closeBox)) throw new Error(`Toast title overlaps the close button: ${name}`);
  if (closeBox.x <= iconBox.x) throw new Error(`Toast close button must be opposite the icon: ${name}`);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Toast causes horizontal overflow: ${name}`);
  await assertAccessible(page, `toast-${name}`);
  await page.screenshot({ path: path.join(output, `toast-${name}.jpg`), type: "jpeg", quality: 92 });
  await close.click();
  await toast.waitFor({ state: "hidden" });
}

const browserName = process.env.BROWSER ?? "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error(`Unsupported BROWSER: ${browserName}`);
const port = Number(process.env.VERIFY_PORT ?? 3100);
const origin = `http://127.0.0.1:${port}`;
const output = path.resolve(process.env.VERIFY_OUTPUT ?? `.verification/${browserName}`);
const dataDir = path.join(output, "data");
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
console.log(`Browser engine: ${browserName}`);

const server = spawn(process.execPath, ["dist/boot.js"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOST: "127.0.0.1", DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLogs = "";
server.stdout.on("data", (chunk) => { serverLogs += chunk; });
server.stderr.on("data", (chunk) => { serverLogs += chunk; });
let browser;
let secondContext;

async function resetPassword(password) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/reset-password.mjs"], {
      env: { ...process.env, DATA_DIR: dataDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout.on("data", (chunk) => { logs += chunk; });
    child.stderr.on("data", (chunk) => { logs += chunk; });
    child.on("error", reject);
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Password reset timed out\n${logs}`)); }, 15000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`Password reset failed (${code})\n${logs}`));
    });
    child.stdin.end(`${password}\n${password}\n`);
  });
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error(`Server did not start\n${serverLogs}`);

  const shellResponse = await fetch(`${origin}/`);
  const shellHeaders = shellResponse.headers;
  if (!shellHeaders.get("content-security-policy")?.includes("default-src 'self'")) throw new Error("Production CSP is missing");
  if (shellHeaders.get("x-frame-options") !== "DENY" || shellHeaders.get("x-content-type-options") !== "nosniff") throw new Error("Browser security headers are missing");
  const healthResponse = await fetch(`${origin}/api/health`);
  if (healthResponse.headers.get("cache-control") !== "no-store") throw new Error("Private API responses must not be cached");
  const crossOriginLog = await fetch(`${origin}/api/log`, {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
    body: JSON.stringify([{ msg: "must-be-rejected" }]),
  });
  if (crossOriginLog.status !== 403 || crossOriginLog.headers.get("cache-control") !== "no-store") throw new Error("Cross-origin API mutation was not safely rejected");
  const sameOriginLog = await fetch(`${origin}/api/log`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify([{ msg: "same-origin-security-check" }]),
  });
  if (sameOriginLog.status !== 204) throw new Error("Same-origin API mutation was rejected");

  browser = await browserType.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
    env: browserName === "firefox" && process.env.FIREFOX_DISABLE_SANDBOX === "1"
      ? { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: "1", MOZ_DISABLE_GMP_SANDBOX: "1" }
      : process.env,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.addInitScript(() => {
    const originalConsoleError = console.error.bind(console);
    console.error = (...values) => {
      const readable = values.map((value) => {
        if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
        if (typeof value === "object") {
          try { return JSON.stringify(value); } catch { return String(value); }
        }
        return String(value);
      });
      originalConsoleError(...readable);
    };
  });
  const page = await context.newPage();
  const errors = [];
  const badResponses = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (nativeDialog) => { errors.push(`Unexpected native ${nativeDialog.type()} dialog`); void nativeDialog.dismiss(); });
  page.on("response", (response) => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });

  await page.goto(origin, { waitUntil: "networkidle" });
  await page.getByText("Создайте локальный вход", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "auth-setup-desktop.jpg"), type: "jpeg", quality: 85, fullPage: true });
  await page.getByLabel("Логин", { exact: true }).fill("tester");
  await page.locator('input[autocomplete="new-password"]').first().fill("first-local-password");
  await page.getByLabel("Повторите пароль", { exact: true }).fill("first-local-password");
  await page.getByRole("button", { name: "Создать вход и продолжить", exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.getByRole("heading", { name: "Ваше пространство готово", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "guide-welcome-desktop.jpg"), type: "jpeg", quality: 90 });
  await page.getByRole("button", { name: "Начать знакомство", exact: true }).click();
  const guideDialog = page.getByRole("dialog", { name: "Руководство по Точке опоры", exact: true });
  await guideDialog.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".guide-image");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  await page.waitForTimeout(350);
  await assertAccessible(page, "guide-desktop");
  await assertGuideCloseClearance(guideDialog, "desktop");
  await page.screenshot({ path: path.join(output, "guide-step-desktop.jpg"), type: "jpeg", quality: 90 });
  await guideDialog.getByRole("button", { name: /^Увеличить изображение:/ }).click();
  const imageViewer = page.getByRole("dialog", { name: "Просмотр иллюстрации", exact: true });
  await imageViewer.waitFor();
  await page.waitForTimeout(350);
  await assertGuideImageFit(imageViewer, "light desktop");
  await page.screenshot({ path: path.join(output, "guide-image-viewer-light-desktop.jpg"), type: "jpeg", quality: 90 });
  const initialImageBox = await imageViewer.locator(".guide-image-viewer").boundingBox();
  await imageViewer.getByRole("button", { name: "Приблизить", exact: true }).click();
  await imageViewer.getByText("125%", { exact: true }).waitFor();
  const enlargedImageBox = await imageViewer.locator(".guide-image-viewer").boundingBox();
  if (!initialImageBox || !enlargedImageBox || enlargedImageBox.width <= initialImageBox.width || enlargedImageBox.height <= initialImageBox.height) throw new Error("Guide image zoom does not enlarge the image proportionally");
  await imageViewer.locator("[data-guide-image-viewport]").evaluate((element) => { element.scrollLeft = 40; });
  await page.screenshot({ path: path.join(output, "guide-image-viewer-light-zoom-desktop.jpg"), type: "jpeg", quality: 90 });
  await imageViewer.getByRole("button", { name: "По размеру экрана", exact: true }).click();
  await imageViewer.getByText("100%", { exact: true }).waitFor();
  await assertGuideImageFit(imageViewer, "reset desktop");
  await assertAccessible(page, "guide-image-viewer-desktop");
  await imageViewer.press("Escape");
  await imageViewer.waitFor({ state: "hidden" });
  await guideDialog.press("Escape");
  await guideDialog.waitFor({ state: "hidden" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await guideDialog.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".guide-image");
    return image instanceof HTMLImageElement && image.src.endsWith("/01-start-dark.jpg") && image.complete && image.naturalWidth > 0;
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "guide-step-dark-desktop.jpg"), type: "jpeg", quality: 90 });
  await guideDialog.getByRole("button", { name: /^Увеличить изображение:/ }).click();
  await imageViewer.waitFor();
  await imageViewer.locator(".guide-image-viewer").waitFor();
  await page.waitForTimeout(350);
  await assertGuideImageFit(imageViewer, "dark desktop");
  await page.screenshot({ path: path.join(output, "guide-image-viewer-dark-desktop.jpg"), type: "jpeg", quality: 90 });
  await imageViewer.press("Escape");
  await imageViewer.waitFor({ state: "hidden" });
  await guideDialog.press("Escape");
  await guideDialog.waitFor({ state: "hidden" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await guideDialog.waitFor();
  for (let step = 2; step <= 6; step++) {
    if (await guideDialog.getByLabel("Перейти к функции", { exact: true }).getByRole("button").count() === 0) throw new Error(`Guide step ${step - 1} has no feature link`);
    await guideDialog.getByRole("button", { name: "Далее", exact: true }).click();
    await guideDialog.getByText(`${step} из 6`, { exact: true }).waitFor();
  }
  if (await guideDialog.getByLabel("Перейти к функции", { exact: true }).getByRole("button").count() === 0) throw new Error("Last guide step has no feature link");
  await guideDialog.getByRole("button", { name: "Начать пользоваться", exact: true }).click();
  await guideDialog.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  if (await page.getByRole("heading", { name: "Ваше пространство готово", exact: true }).count()) throw new Error("Completed onboarding must not reopen");
  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await guideDialog.waitFor();
  await guideDialog.press("ArrowRight");
  await guideDialog.getByText("2 из 6", { exact: true }).waitFor();
  await guideDialog.press("ArrowLeft");
  await guideDialog.getByText("1 из 6", { exact: true }).waitFor();
  await guideDialog.press("Escape");
  await guideDialog.waitFor({ state: "hidden" });
  await page.evaluate(() => localStorage.setItem("tochka-last-seen-version", "1.5.0"));
  await page.reload({ waitUntil: "networkidle" });
  const updateDialog = page.getByRole("dialog", { name: "Что нового", exact: true });
  await updateDialog.waitFor();
  await updateDialog.locator("li").filter({ hasText: "весь снимок помещается" }).waitFor();
  await page.screenshot({ path: path.join(output, "guide-update-desktop.jpg"), type: "jpeg", quality: 90 });
  await updateDialog.getByRole("button", { name: "Открыть руководство", exact: true }).click();
  await guideDialog.waitFor();
  await guideDialog.getByRole("button", { name: "Пропустить", exact: true }).click();
  await guideDialog.waitFor({ state: "hidden" });
  await page.reload({ waitUntil: "networkidle" });
  if (await updateDialog.count()) throw new Error("Update notice must appear only once");
  await page.getByRole("heading", { name: "Всё важное — на одном экране", exact: true }).waitFor();
  await captureGuideImages(page, "01-start");
  if (await page.getByRole("heading", { name: "Иностранная валюта", exact: true }).count()) throw new Error("A new user must not see an empty foreign currency section");
  if (await page.locator("[data-currency]").count()) throw new Error("A new user must not see empty currency cards");

  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await guideDialog.waitFor();
  await guideDialog.getByText("Дата остатков — точка начала расчёта.", { exact: false }).waitFor();
  await guideDialog.getByText("Тип и дни можно менять в любой момент", { exact: false }).waitFor();
  await guideDialog.getByRole("button", { name: "Настроить график дохода", exact: true }).waitFor();
  await guideDialog.getByRole("button", { name: "Указать остатки", exact: true }).click();
  await page.waitForURL(`${origin}/data?tab=settings`);
  await guideDialog.waitFor({ state: "hidden" });

  const dataHint = page.getByRole("button", { name: "Подсказка: Ваши данные остаются вашими", exact: true });
  const hintContent = page.locator('[data-feature-hint-content][data-state="open"]');
  await dataHint.click();
  await hintContent.getByText("Перед крупными изменениями создайте копию.", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
  await hintContent.waitFor({ state: "hidden" });
  await page.mouse.move(0, 0);
  await dataHint.hover();
  await hintContent.waitFor();
  await page.waitForTimeout(250);
  await assertAccessible(page, "feature-hint-desktop");
  await page.screenshot({ path: path.join(output, "feature-hint-desktop.jpg"), type: "jpeg", quality: 90 });
  await page.mouse.move(0, 0);
  await hintContent.waitFor({ state: "hidden" });

  const incomeHint = page.getByRole("button", { name: "Подсказка: График дохода", exact: true });
  await incomeHint.click();
  await hintContent.getByText("главная, календарь и связанные прогнозы — после сохранения настроек", { exact: false }).waitFor();
  await hintContent.getByText("Уже внесённые доходы и расходы останутся без изменений.", { exact: false }).waitFor();
  await page.keyboard.press("Escape");
  await hintContent.waitFor({ state: "hidden" });

  const hintsToggle = page.getByRole("switch", { name: "Показывать контекстные подсказки", exact: true });
  await hintsToggle.click();
  await page.waitForFunction(() => document.querySelectorAll("[data-feature-hint]").length === 0);
  await page.reload({ waitUntil: "networkidle" });
  if (await page.locator("[data-feature-hint]").count()) throw new Error("Disabled feature hints reappeared after reload");
  await page.getByRole("button", { name: "Руководство", exact: true }).click();
  await guideDialog.waitFor();
  await guideDialog.press("Escape");
  await guideDialog.waitFor({ state: "hidden" });
  await hintsToggle.click();
  await page.waitForSelector("[data-feature-hint]");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-feature-hint]");
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await page.getByLabel("Наличные, $", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  await page.getByText("Настройки и валютные курсы сохранены", { exact: true }).waitFor();
  await assertToastLayout(page, output, "desktop");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  await page.getByText("Настройки и валютные курсы сохранены", { exact: true }).waitFor();
  await assertToastLayout(page, output, "mobile");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.locator('[data-currency="USD"]').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-currency="USD"]')?.textContent?.includes("100"));
  await page.screenshot({ path: path.join(output, "dashboard-currency-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await page.getByRole("button", { name: "Подробный обзор", exact: true }).click();
  const rubOnlyReserve = page.locator("section").filter({ has: page.getByRole("heading", { name: "Неприкосновенный запас", exact: true }) });
  await rubOnlyReserve.getByText(/из рублёвого остатка доступно для запаса/).waitFor();
  const reserveText = (await rubOnlyReserve.innerText()).replace(/\s/g, "");
  if (!reserveText.includes("0₽изрублёвогоостатка") || reserveText.includes("8000₽изрублёвогоостатка")) throw new Error(`Reserve must ignore USD before exchange: ${reserveText}`);
  await page.screenshot({ path: path.join(output, "dashboard-reserve-rub-only-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });

  await page.goto(`${origin}/operations?new=1&type=${encodeURIComponent("Обмен")}`, { waitUntil: "networkidle" });
  const exchangeDialog = page.getByRole("dialog", { name: "Новая операция", exact: true });
  await exchangeDialog.waitFor();
  await exchangeDialog.getByRole("combobox", { name: "Категория", exact: true }).click();
  await page.getByRole("option", { name: "Обмен валюты", exact: true }).click();
  await exchangeDialog.locator('select:has(option[value="sell"])').selectOption("sell");
  await exchangeDialog.locator('input[type="number"]').nth(0).fill("100");
  await exchangeDialog.locator('input[type="number"]').nth(1).fill("8000");
  await exchangeDialog.getByLabel("Комментарий", { exact: true }).fill("Проверочный полный обмен");
  await exchangeDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.waitForTimeout(400);
  if (await exchangeDialog.isVisible()) {
    const details = JSON.stringify({ dialog: await exchangeDialog.innerText(), body: await page.locator("body").innerText(), errors, badResponses, serverLogs });
    await page.screenshot({ path: path.join(output, "exchange-failure.jpg"), type: "jpeg", quality: 90, fullPage: true });
    throw new Error(`Exchange was not saved: ${details}`);
  }
  await exchangeDialog.waitFor({ state: "hidden" });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Иностранная валюта", exact: true }).waitFor({ state: "hidden" });
  await page.locator("[data-currency]").first().waitFor({ state: "hidden" });
  await page.screenshot({ path: path.join(output, "dashboard-after-full-exchange-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await captureGuideImages(page, "03-today");
  await page.goto(`${origin}/operations`, { waitUntil: "networkidle" });
  await page.getByText("Проверочный полный обмен", { exact: true }).first().waitFor();
  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Дата остатков, обязательное поле:/ }).click();
  const startDatePicker = page.locator(".date-picker-popover");
  await startDatePicker.locator("select").nth(0).selectOption("9");
  await startDatePicker.locator("select").nth(1).selectOption("2026");
  await startDatePicker.locator('[data-day="2026-10-01"] button').click();
  await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
  await page.getByText("Настройки и валютные курсы сохранены", { exact: true }).waitFor();

  errors.length = 0;
  badResponses.length = 0;

  await page.goto(`${origin}/plan?tab=wallet`, { waitUntil: "networkidle" });
  const countedRub = page.getByLabel("Насчитано рублей, ₽", { exact: true });
  const countedUsd = page.getByLabel("Насчитано долларов, $", { exact: true });
  const saveReconciliation = page.getByRole("button", { name: "Сохранить сверку", exact: true });
  if (await countedRub.inputValue() !== "" || await countedUsd.inputValue() !== "") throw new Error("A new user's reconciliation form must be empty");
  if (!(await saveReconciliation.isDisabled())) throw new Error("An empty reconciliation must not be saved as zeroes");
  await page.getByText("Введите фактические суммы, чтобы увидеть расхождение.", { exact: true }).waitFor();
  await countedRub.fill("0");
  await countedUsd.fill("0");
  if (await saveReconciliation.isDisabled()) throw new Error("Explicit zero amounts should be valid");
  await countedRub.fill("");
  await countedUsd.fill("");
  await page.screenshot({ path: path.join(output, "planning-empty-reconciliation-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });

  const routes = [
    ["/", "dashboard"], ["/operations", "operations"], ["/analytics", "analytics"], ["/plan", "planning"],
    ["/calendar", "calendar"], ["/mood", "mood"], ["/notes", "notes"], ["/assets", "assets"], ["/data", "data"],
  ];
  for (const [route, name] of routes) {
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    if (route === "/operations") {
      await page.getByLabel("Поиск операций", { exact: true }).waitFor();
      if (await page.getByLabel("Поиск операций", { exact: true }).count() !== 1) throw new Error("Journal should contain exactly one main search field");
      if (await page.getByLabel("Месяц", { exact: true }).count()) throw new Error("Small month field next to CSV should be removed");
    }
    if (route === "/analytics") await page.getByText("Нет сравнения", { exact: true }).waitFor();
    if (route === "/mood") {
      const layout = await page.locator(".mood-insights-grid").evaluate((grid) => {
        const rect = (title) => {
          const section = [...grid.children].find((child) => child.querySelector("h2")?.textContent?.trim() === title);
          if (!section) throw new Error(`Mood section is missing: ${title}`);
          const box = section.getBoundingClientRect();
          return { x: box.x, y: box.y, bottom: box.bottom, width: box.width };
        };
        return { dynamics: rect("Динамика"), calendar: rect("Календарь"), rhythm: rect("Ритм недели"), correlations: rect("Что наблюдается вместе"), gridWidth: grid.getBoundingClientRect().width };
      });
      if (Math.abs(layout.dynamics.y - layout.calendar.y) > 1) throw new Error("Mood chart and calendar should share the top line");
      if (Math.abs(layout.rhythm.x - layout.dynamics.x) > 1 || Math.abs(layout.rhythm.y - layout.dynamics.bottom - 20) > 1) throw new Error("Mood weekly rhythm should sit directly below the chart");
      if (Math.abs(layout.calendar.bottom - layout.rhythm.bottom) > 1) throw new Error("Mood calendar should end on the same line as the weekly rhythm");
      if (layout.correlations.y < Math.max(layout.calendar.bottom, layout.rhythm.bottom) + 19 || Math.abs(layout.correlations.width - layout.gridWidth) > 1) throw new Error("Mood correlations should start immediately below both columns at full width");
      await page.screenshot({ path: path.join(output, "mood-layout-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
    }
    await assertAccessible(page, `${name}-empty-desktop`);
    await page.screenshot({ path: path.join(output, `${name}-desktop.jpg`), type: "jpeg", quality: 82, fullPage: true });
    const metrics = await page.evaluate(() => ({
      title: document.querySelector("h1")?.textContent ?? "",
      width: document.documentElement.scrollWidth,
      viewport: innerWidth,
      requests: performance.getEntriesByType("resource").length,
      transferBytes: performance.getEntriesByType("resource").reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
    }));
    console.log(name, JSON.stringify(metrics));
    if (metrics.width > metrics.viewport) throw new Error(`Horizontal overflow: ${name}`);
  }

  const expenses = [
    { date: "2026-10-15", category: "Еда", amount: "1200", note: "Продукты на неделю" },
    { date: "2026-11-01", category: "Транспорт", amount: "340", note: "Метро и автобус" },
    { date: "2026-11-03", category: "Развлечения и кафе", amount: "2500", note: "Ужин с друзьями" },
    { date: "2026-11-01", category: "Аренда квартиры", amount: "100000", note: "Аренда за ноябрь" },
    { date: "2026-11-02", category: "Быт и одежда", amount: "30000", note: "Покупки для дома" },
    { date: "2026-10-20", category: "Здоровье и лекарства", amount: "12000", note: "Проверка здоровья" },
    { date: "2026-11-03", category: "Коммуналка", amount: "8000", note: "Счета за квартиру" },
    { date: "2026-10-25", category: "Подарки и прочее", amount: "2500", note: "Подарок близким" },
  ];
  for (const expense of expenses) {
    await page.goto(`${origin}/operations?new=1&date=${expense.date}`, { waitUntil: "networkidle" });
    const operationDialog = page.getByRole("dialog", { name: "Новая операция", exact: true });
    await operationDialog.waitFor();
    await operationDialog.getByRole("combobox", { name: "Категория", exact: true }).click();
    const option = page.getByRole("option", { name: expense.category, exact: true });
    if (await option.count()) await option.click();
    else {
      await page.getByPlaceholder("Найти категорию текстом…", { exact: true }).fill(expense.category);
      await page.getByRole("button", { name: `Использовать «${expense.category}»`, exact: true }).click();
    }
    await operationDialog.getByLabel("Сумма, ₽", { exact: true }).fill(expense.amount);
    await operationDialog.getByLabel("Комментарий", { exact: true }).fill(expense.note);
    await operationDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
    await operationDialog.waitFor({ state: "hidden" });
  }
  await page.goto(`${origin}/operations?new=1&date=2026-11-01`, { waitUntil: "networkidle" });
  const incomeDialog = page.getByRole("dialog", { name: "Новая операция", exact: true });
  await incomeDialog.locator("select").first().selectOption("Доход");
  await incomeDialog.getByRole("combobox", { name: "Категория", exact: true }).click();
  await page.getByRole("option", { name: "Зарплата", exact: true }).click();
  await incomeDialog.getByLabel("Сумма, ₽", { exact: true }).fill("40000");
  await incomeDialog.getByLabel("Комментарий", { exact: true }).fill("Проверочный доход");
  await incomeDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await incomeDialog.waitFor({ state: "hidden" });

  const incomeScheduleSelect = page.getByLabel("График дохода", { exact: true });
  const saveIncomeSchedule = async () => {
    await page.getByRole("button", { name: "Сохранить настройки", exact: true }).click();
    await page.getByText("Настройки и валютные курсы сохранены", { exact: true }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
  };
  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  if (await incomeScheduleSelect.inputValue() !== "twice") throw new Error("Legacy settings must retain the twice-monthly schedule");
  await page.getByLabel("Первая выплата, день", { exact: true }).fill("10");
  await page.getByLabel("Правило второй выплаты", { exact: true }).selectOption("custom");
  await page.getByLabel("Вторая выплата, день", { exact: true }).fill("25");
  await saveIncomeSchedule();
  if (await page.getByLabel("Первая выплата, день", { exact: true }).inputValue() !== "10" || await page.getByLabel("Вторая выплата, день", { exact: true }).inputValue() !== "25") throw new Error("Custom income days were not persisted");
  await page.getByText("Ближайшие плановые даты", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "income-schedule-custom-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await page.goto(`${origin}/calendar`, { waitUntil: "networkidle" });
  await page.getByText("Первая зарплата · 10-е число", { exact: true }).waitFor();
  await page.getByText("Вторая зарплата · 25-е число", { exact: true }).waitFor();
  await assertAccessible(page, "income-schedule-custom-calendar-desktop");
  await page.screenshot({ path: path.join(output, "income-calendar-custom-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Подробный обзор", exact: true }).click();
  await page.getByText("Первая зарплата · 10-е число", { exact: true }).waitFor();
  await page.getByText("Вторая зарплата · 25-е число", { exact: true }).waitFor();

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await incomeScheduleSelect.selectOption("monthly");
  await page.getByLabel("День выплаты", { exact: true }).fill("20");
  await saveIncomeSchedule();
  if (await incomeScheduleSelect.inputValue() !== "monthly") throw new Error("Monthly income schedule was not persisted");
  await page.goto(`${origin}/calendar`, { waitUntil: "networkidle" });
  await page.getByText("Зарплата · 20-е число", { exact: true }).waitFor();
  if (await page.locator('section[aria-label="Зарплатные даты выбранного месяца"] .number').count() !== 1) throw new Error("Monthly schedule must show exactly one planned date");

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await incomeScheduleSelect.selectOption("irregular");
  await page.getByText("Доходы без фиксированных дат", { exact: true }).waitFor();
  await saveIncomeSchedule();
  if (await incomeScheduleSelect.inputValue() !== "irregular") throw new Error("Irregular income schedule was not persisted");
  await page.goto(`${origin}/calendar`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Доходы без фиксированного графика", exact: true }).waitFor();
  if (await page.getByRole("button", { name: "Зарплата", exact: true }).count()) throw new Error("Irregular calendar must hide the salary filter");
  if (await page.getByText("Плановая дата", { exact: true }).count()) throw new Error("Irregular calendar must not contain salary plans");
  await page.locator('button[aria-describedby="calendar-day-2026-11-01-description"]').click();
  await page.getByText("Проверочный доход", { exact: true }).first().waitFor();
  await assertAccessible(page, "income-schedule-irregular-calendar-desktop");
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Подробный обзор", exact: true }).click();
  await page.getByRole("heading", { name: "Доход без фиксированных дат", exact: true }).waitFor();
  if (await page.getByText(/До зарплаты:/).count()) throw new Error("Irregular dashboard must not show a salary countdown");
  await page.screenshot({ path: path.join(output, "income-irregular-dashboard-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await page.getByRole("button", { name: "Добавить доход", exact: true }).click();
  const irregularIncomeDialog = page.getByRole("dialog", { name: "Новая операция", exact: true });
  await irregularIncomeDialog.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-slot="dialog-content"] select')?.value === "Доход");
  await irregularIncomeDialog.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Income schedule settings overflow on mobile");
  await assertAccessible(page, "income-schedule-irregular-settings-mobile");
  await page.screenshot({ path: path.join(output, "income-schedule-irregular-mobile.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await page.goto(`${origin}/calendar`, { waitUntil: "networkidle" });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Irregular calendar overflows on mobile");
  await page.screenshot({ path: path.join(output, "income-irregular-calendar-mobile.jpg"), type: "jpeg", quality: 88, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await incomeScheduleSelect.selectOption("twice");
  await page.getByLabel("Первая выплата, день", { exact: true }).fill("15");
  await page.getByLabel("Правило второй выплаты", { exact: true }).selectOption("last-working");
  await saveIncomeSchedule();
  if (await page.getByLabel("Правило второй выплаты", { exact: true }).inputValue() !== "last-working") throw new Error("Default second salary rule was not restored");

  await page.goto(`${origin}/operations`, { waitUntil: "networkidle" });
  const journalSearch = page.getByLabel("Поиск операций", { exact: true });
  await journalSearch.fill("Счета за квартиру");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
  await page.locator("tbody tr").filter({ hasText: "Коммуналка" }).waitFor();
  await journalSearch.fill("Запись, которой нет");
  await page.getByText("Операции не найдены", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 1);
  if (await journalSearch.inputValue()) throw new Error("Reset filters should clear the main journal search");
  await page.getByLabel("Тип операции", { exact: true }).selectOption("Доход");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody tr")?.textContent?.includes("Зарплата"));
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await page.getByLabel("Валюта операции", { exact: true }).selectOption("USD");
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1 && document.querySelector("tbody tr")?.textContent?.includes("Обмен"));
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 1);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "operations-main-search-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await captureGuideImages(page, "02-operations");

  const desktopNav = page.getByRole("navigation", { name: "Основная навигация", exact: true });
  const desktopNavItems = desktopNav.locator("a:visible, button:visible");
  const desktopNavCount = await desktopNavItems.count();
  if (desktopNavCount !== 5) throw new Error(`Desktop navigation should contain four primary links and More; received ${desktopNavCount}: ${await desktopNavItems.allTextContents()}`);
  await desktopNav.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.screenshot({ path: path.join(output, "desktop-more.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await desktopNav.getByRole("link", { name: "Аналитика", exact: true }).click();
  await page.waitForURL(`${origin}/analytics`);
  await page.getByRole("heading", { name: "Закономерности в ваших деньгах", exact: true }).waitFor();
  const analyticsSummary = page.locator('section[aria-label="Ключевые показатели"]');
  await page.waitForFunction(() => document.querySelector('section[aria-label="Ключевые показатели"]')?.textContent?.replace(/\s/g, "").includes("156540₽"));
  if (!(await analyticsSummary.innerText()).includes("Средний чек")) throw new Error("Analytics summary is incomplete");
  const cashFlowAlert = page.getByRole("alert").filter({ hasText: "Рублёвый остаток уже отрицательный." });
  await cashFlowAlert.waitFor();
  const unconfirmedIncomeSchedule = page.getByTestId("unconfirmed-income-schedule");
  await unconfirmedIncomeSchedule.getByText("Их суммы не угадываются по прошлым месяцам.", { exact: false }).waitFor();
  if (await unconfirmedIncomeSchedule.locator("li").count() < 1) throw new Error("Forecast must show scheduled paydays without inventing amounts");
  await page.getByText("0 ₽ — граница бюджета", { exact: true }).waitFor();
  const cashFlowChart = page.locator(".cash-flow-chart");
  const deficitArea = cashFlowChart.locator(".recharts-reference-area .recharts-reference-area-rect");
  await deficitArea.waitFor();
  if (await deficitArea.getAttribute("fill") !== "oklch(var(--destructive))") throw new Error("Cash-flow deficit area is missing the destructive color");
  const zeroBudgetLine = cashFlowChart.locator(".recharts-reference-line-line");
  if (await zeroBudgetLine.getAttribute("stroke") !== "oklch(var(--destructive))") throw new Error("Cash-flow zero line is missing the destructive color");
  await page.waitForTimeout(650);
  await assertAccessible(page, "analytics-cash-flow-negative-desktop");
  await page.screenshot({ path: path.join(output, "analytics-cash-flow-negative-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });

  await page.getByRole("button", { name: "Сохранить новое", exact: true }).click();
  const saveViewDialog = page.getByRole("dialog", { name: "Сохранить представление", exact: true });
  await saveViewDialog.waitFor();
  await saveViewDialog.getByLabel("Название представления", { exact: true }).fill("");
  await saveViewDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await saveViewDialog.getByText("Введите название представления.", { exact: true }).waitFor();
  await saveViewDialog.getByLabel("Название представления", { exact: true }).fill("Мои расходы");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "analytics-save-view-dialog-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await saveViewDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await saveViewDialog.waitFor({ state: "hidden" });
  const savedViewSelect = page.getByRole("combobox", { name: "Сохранённые представления", exact: true });
  await page.waitForFunction(() => document.querySelector('[aria-label="Сохранённые представления"]')?.textContent?.includes("Мои расходы"));
  await savedViewSelect.click();
  await page.getByRole("option", { name: "Мои расходы", exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "analytics-saved-view-list-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Переименовать представление", exact: true }).click();
  const renameViewDialog = page.getByRole("dialog", { name: "Переименовать представление", exact: true });
  await renameViewDialog.getByLabel("Новое название", { exact: true }).fill("Расходы за 6 месяцев");
  await renameViewDialog.getByRole("button", { name: "Сохранить название", exact: true }).click();
  await renameViewDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector('[aria-label="Сохранённые представления"]')?.textContent?.includes("Расходы за 6 месяцев"));

  await page.getByRole("button", { name: "12 мес.", exact: true }).click();
  await page.getByText(/«Расходы за 6 месяцев»: фильтры изменены/).waitFor();
  await page.getByRole("button", { name: "Вернуть сохранённые настройки", exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "6 мес." && button.getAttribute("aria-pressed") === "true"));
  await page.getByRole("button", { name: "12 мес.", exact: true }).click();
  await page.getByRole("button", { name: "Обновить сохранённое представление", exact: true }).click();
  await page.getByRole("button", { name: "Обновить сохранённое представление", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "3 мес.", exact: true }).click();
  await savedViewSelect.click();
  await page.getByRole("option", { name: "Расходы за 6 месяцев", exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "12 мес." && button.getAttribute("aria-pressed") === "true"));
  await page.getByRole("button", { name: "3 мес.", exact: true }).click();
  await savedViewSelect.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Расходы за 6 месяцев", exact: true }).press("Enter");
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "12 мес." && button.getAttribute("aria-pressed") === "true"));

  await page.reload({ waitUntil: "networkidle" });
  await savedViewSelect.click();
  await page.getByRole("option", { name: "Расходы за 6 месяцев", exact: true }).click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent?.trim() === "12 мес." && button.getAttribute("aria-pressed") === "true"));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "analytics-active-saved-view-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await captureGuideImages(page, "05-analytics");
  await page.getByRole("button", { name: "Удалить представление", exact: true }).click();
  const deleteViewDialog = page.getByRole("alertdialog", { name: "Удалить «Расходы за 6 месяцев»?", exact: true });
  await deleteViewDialog.waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(output, "analytics-delete-saved-view-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await deleteViewDialog.getByRole("button", { name: "Удалить", exact: true }).click();
  await deleteViewDialog.waitFor({ state: "hidden" });
  if (!(await savedViewSelect.isDisabled())) throw new Error("Deleting the last saved view should disable the selector");
  if (await page.evaluate(() => JSON.parse(localStorage.getItem("tochka-analytics-views") ?? "[]").length) !== 0) throw new Error("Saved view was not deleted from local storage");
  await page.getByRole("button", { name: "6 мес.", exact: true }).click();

  await page.waitForTimeout(650);
  const compositionChart = page.locator(".category-composition-chart");
  if (await compositionChart.locator(".recharts-sector").count() !== 7) throw new Error("Category chart should contain six sectors and Other");
  if (await compositionChart.locator('[tabindex]:not([tabindex="-1"])').count() !== 0) throw new Error("Non-interactive chart sectors should not produce focus rectangles");
  const compositionBox = await compositionChart.boundingBox();
  if (!compositionBox) throw new Error("Category chart has no visible bounds");
  await page.mouse.move(compositionBox.x + compositionBox.width / 2 + 35, compositionBox.y + 30);
  await compositionChart.getByText("Категория", { exact: true }).waitFor();
  if (await compositionChart.locator(".recharts-tooltip-wrapper").count() !== 0) throw new Error("Floating category tooltip still overlaps the chart");
  const legendOverlaps = await page.locator(".category-composition-legend > li").evaluateAll((items) => items.flatMap((item, index) => {
    const columns = item.querySelectorAll(":scope > div > span");
    if (columns.length !== 2) return [index];
    const name = columns[0].getBoundingClientRect();
    const amount = columns[1].getBoundingClientRect();
    return name.right > amount.left + 1 || item.scrollWidth > item.clientWidth + 1 ? [index] : [];
  }));
  if (legendOverlaps.length) throw new Error(`Category legend overlaps: ${JSON.stringify(legendOverlaps)}`);
  await page.screenshot({ path: path.join(output, "analytics-composition-hover-desktop.jpg"), type: "jpeg", quality: 90, fullPage: true });
  await page.mouse.move(10, 10);
  await compositionChart.getByText("Всего", { exact: true }).waitFor();

  const csvPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт CSV", exact: true }).click();
  const csvDownload = await csvPromise;
  const csv = await fs.readFile(await csvDownload.path(), "utf8");
  if (!csv.includes("Продукты на неделю") || !csv.includes("2500") || !csv.includes("Сумма RUB")) throw new Error("Analytics CSV does not match the selection");

  await page.getByRole("button", { name: "Доходы", exact: true }).click();
  await page.getByRole("heading", { name: "Откуда приходят деньги", exact: true }).waitFor();
  await page.getByText("Зарплата", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Расходы", exact: true }).click();
  await page.getByRole("button", { name: "Дни", exact: true }).click();
  if (await page.getByRole("button", { name: "Дни", exact: true }).getAttribute("aria-pressed") !== "true") throw new Error("Daily grouping did not activate");
  await page.getByRole("button", { name: "Недели", exact: true }).click();
  await page.getByRole("button", { name: "Месяцы", exact: true }).click();
  await page.getByRole("button", { name: "Таблица", exact: true }).click();
  await page.getByRole("columnheader", { name: "Период", exact: true }).waitFor();
  await page.getByRole("button", { name: "График", exact: true }).click();

  await page.getByRole("button", { name: /^Еда / }).click();
  await page.getByText("Динамика категории", { exact: true }).waitFor();
  await page.getByText("Продукты на неделю", { exact: true }).first().waitFor();
  await page.screenshot({ path: path.join(output, "analytics-drilldown-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });
  await page.getByRole("button", { name: /^Еда / }).click();

  await page.getByRole("button", { name: "Свой период", exact: true }).click();
  await page.getByText("В этом периоде нет расходов", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Начало периода, обязательное поле:/ }).click();
  await page.locator(".date-picker-popover").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "6 мес.", exact: true }).click();
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(output, "analytics-filled-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });

  await page.keyboard.press("ControlOrMeta+K");
  await page.locator('[data-slot="command-input"]').fill("Аналитика");
  await page.locator('[data-search-result="section-analytics"]').click();
  await page.waitForURL(`${origin}/analytics`);

  await page.goto(`${origin}/mood`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Новая запись", exact: true }).first().click();
  await page.getByRole("button", { name: /^Дата, обязательное поле:/ }).click();
  const desktopCalendar = page.locator(".date-picker-popover");
  await desktopCalendar.waitFor();
  await page.waitForTimeout(250);
  const firstDay = desktopCalendar.locator("button[data-day]").first();
  const dayBox = await firstDay.boundingBox();
  if (!dayBox || dayBox.width < 44 || dayBox.height < 44) throw new Error("Calendar day targets are too small");
  if (await desktopCalendar.locator("select").count() !== 2) throw new Error("Month/year dropdowns are missing");
  await page.screenshot({ path: path.join(output, "date-picker-mood-desktop.jpg"), type: "jpeg", quality: 88, fullPage: false });
  await desktopCalendar.getByRole("button", { name: "Сегодня", exact: true }).click();
  await desktopCalendar.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Отмена", exact: true }).click();

  for (const entry of [
    { date: "2026-11-01", topic: "Работа / учёба", emotion: "Спокойствие" },
    { date: "2026-11-02", topic: "Семья", emotion: "Радость" },
  ]) {
    await page.goto(`${origin}/mood?new=1&date=${entry.date}`, { waitUntil: "networkidle" });
    const moodDialog = page.getByRole("dialog", { name: "Как вы себя чувствуете?", exact: true });
    await moodDialog.locator("select").nth(2).selectOption(entry.topic);
    await moodDialog.locator("select").nth(1).selectOption(entry.emotion);
    await moodDialog.getByRole("button", { name: "Сохранить запись", exact: true }).click();
    await moodDialog.waitFor({ state: "hidden" });
  }
  const moodRecords = page.locator('section[aria-label="Записи настроения"]');
  const moodRecordItems = moodRecords.locator("article");
  const allMoodDays = moodRecords.getByRole("button", { name: "Все дни", exact: true });
  const moodTopic = page.getByLabel("Фильтр по теме", { exact: true });
  await page.goto(`${origin}/mood?date=2026-11-01`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 1);
  await moodTopic.selectOption("Все");
  if (await moodRecordItems.count() !== 1) throw new Error("Topic filter must not silently change the selected date");
  await assertAccessible(page, "mood-selected-day-desktop");
  await moodRecords.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "mood-selected-day-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await allMoodDays.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 2);
  if (new URL(page.url()).searchParams.has("date")) throw new Error("All days must clear the date URL filter");

  await page.locator('[aria-describedby="calendar-day-2026-11-01-description"]').click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 1);
  await allMoodDays.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 2);

  const yearMoodDay = page.getByRole("button", { name: /^1 нояб\.\s*2026 г\., настроение 5$/, exact: true });
  await yearMoodDay.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 1);
  if (await yearMoodDay.getAttribute("aria-pressed") !== "true") throw new Error("Year map must expose the selected day");
  await yearMoodDay.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 2);
  if (await yearMoodDay.getAttribute("aria-pressed") !== "false") throw new Error("Repeated year-map click must clear the selected day");

  await yearMoodDay.click();
  await moodTopic.selectOption("Семья");
  await moodRecords.getByText("Для выбранного фильтра записей нет.", { exact: true }).waitFor();
  const resetMoodFilters = moodRecords.getByRole("button", { name: "Сбросить фильтры", exact: true });
  await resetMoodFilters.scrollIntoViewIfNeeded();
  await assertAccessible(page, "mood-empty-filters-desktop");
  await page.screenshot({ path: path.join(output, "mood-empty-filters-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await resetMoodFilters.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 2);
  if (await moodTopic.inputValue() !== "Все" || await allMoodDays.count()) throw new Error("Reset must clear both mood filters");

  await page.setViewportSize({ width: 375, height: 812 });
  await yearMoodDay.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 1);
  await allMoodDays.scrollIntoViewIfNeeded();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mood day reset causes mobile overflow");
  await page.screenshot({ path: path.join(output, "mood-selected-day-mobile.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await allMoodDays.click();
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="Записи настроения"] article').length === 2);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${origin}/plan`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Добавить платёж", exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Ближайшая дата:/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(output, "date-picker-payment-desktop.jpg"), type: "jpeg", quality: 88, fullPage: false });
  await desktopCalendar.getByRole("button", { name: "Сегодня", exact: true }).click();
  await page.getByRole("button", { name: /^Ближайшая дата:/ }).click();
  await desktopCalendar.getByRole("button", { name: "Очистить", exact: true }).click();
  const clearedDate = await page.getByRole("button", { name: /^Ближайшая дата:/ }).innerText();
  if (!clearedDate.includes("Выберите дату")) throw new Error("Optional date could not be cleared");
  await page.getByRole("dialog").getByLabel("Название", { exact: true }).fill("Аренда квартиры");
  await page.getByRole("dialog").getByLabel("Сумма, ₽", { exact: true }).fill("100000");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Платёж сохранён", { exact: true }).waitFor();

  await page.goto(`${origin}/notes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Папка", exact: true }).click();
  await page.getByLabel("Название страницы").fill("Проверка библиотеки");
  await page.waitForTimeout(1300);
  await page.getByText(/Сохранено ·/).waitFor();

  await page.getByRole("button", { name: "Заметка", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Новая заметка");
  await page.getByLabel("Название страницы").fill("Идеи для поездки");
  const firstEditor = page.getByLabel("Текст заметки", { exact: true });
  await firstEditor.fill("Важная мысль для поездки");
  await firstEditor.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Жирный", exact: true }).click();
  await page.locator(".note-prose strong", { hasText: "Важная мысль для поездки" }).waitFor();
  await page.getByLabel("Родительская папка").selectOption({ label: "Проверка библиотеки" });
  await page.waitForTimeout(1400);

  await page.getByRole("button", { name: "Заметка", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Новая заметка");
  await page.getByLabel("Название страницы").fill("План поездки");
  await page.getByLabel("Родительская папка").selectOption({ label: "Проверка библиотеки" });
  const secondEditor = page.getByLabel("Текст заметки", { exact: true });
  await secondEditor.fill("Связь: ");
  await secondEditor.press("End");
  await secondEditor.pressSequentially("[[Идеи", { delay: 30 });
  await page.getByRole("option", { name: "Идеи для поездки", exact: true }).click();
  const internalLink = page.locator(".note-prose a[data-note-id]", { hasText: "Идеи для поездки" });
  await internalLink.waitFor();
  await page.waitForTimeout(1400);
  await internalLink.click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Идеи для поездки");
  await page.getByRole("button", { name: "План поездки", exact: true }).last().waitFor();
  await captureGuideImages(page, "04-notes");

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8DAwMDAxMDAwMAAAAwAAf8B9pQAAAAASUVORK5CYII=", "base64");
  await page.getByLabel("Выбрать изображения", { exact: true }).setInputFiles({ name: "place.png", mimeType: "image/png", buffer: png });
  const insertedImage = page.locator('.note-prose img[src^="/api/note-assets/"]');
  await insertedImage.waitFor();
  const imageSrc = await insertedImage.getAttribute("src");
  if (!imageSrc) throw new Error("Image URL was not created");
  const imageResponse = await page.request.get(`${origin}${imageSrc}`);
  if (!imageResponse.ok() || imageResponse.headers()["content-type"] !== "image/png") throw new Error("Protected image could not be loaded");
  await page.waitForTimeout(1500);
  await page.getByText(/Сохранено ·/).waitFor();

  const markdownPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const markdownDownload = await markdownPromise;
  const markdownPath = await markdownDownload.path();
  const markdown = await fs.readFile(markdownPath, "utf8");
  if (!markdown.includes("![place](/api/note-assets/")) throw new Error("Markdown export lost the image");

  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.pdfProof = document.querySelector(".print-document")?.textContent ?? "";
      document.body.dataset.pdfImage = String(document.querySelectorAll(".print-document img").length);
      window.dispatchEvent(new Event("afterprint"));
    };
  });
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.waitForFunction(() => document.body.dataset.pdfProof?.includes("Важная мысль") && document.body.dataset.pdfImage === "1");
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(output, "notes-rich-desktop.jpg"), type: "jpeg", quality: 88, fullPage: false });

  await page.getByRole("button", { name: "Желания", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Мой вишлист");
  await page.getByLabel("Название страницы").fill("Проверочный вишлист");
  await page.getByLabel("Родительская папка").selectOption({ label: "Проверка библиотеки" });
  await page.getByLabel("Название желания", { exact: true }).fill("Поездка к друзьям");
  await page.getByLabel("Примерная стоимость").fill("5000");
  await page.getByLabel("Ссылка на желание").fill("https://example.com/trip");
  await page.getByRole("button", { name: "Добавить желание", exact: true }).click();
  await page.getByText("0 из 1 исполнено", { exact: true }).waitFor();
  await page.getByLabel("Отметить «Поездка к друзьям» исполненным").check();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: path.join(output, "notes-wishlist-desktop.jpg"), type: "jpeg", quality: 82, fullPage: true });

  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+K");
  const searchDialog = page.getByRole("dialog", { name: "Глобальный поиск", exact: true });
  await searchDialog.waitFor();
  if (await searchDialog.locator("[data-search-action]").count() !== 6) throw new Error("Not all quick actions are visible");
  await page.getByText("Недавние записи", { exact: true }).waitFor();
  await page.waitForTimeout(350);
  const searchInput = page.locator('[data-slot="command-input"]');
  const searchInputWrapper = page.locator('[data-slot="command-input-wrapper"]');
  const inputOutline = await searchInput.evaluate((element) => getComputedStyle(element).outlineStyle);
  if (inputOutline !== "none") throw new Error(`Search input has a misplaced focus outline: ${inputOutline}`);
  const [inputBox, inputWrapperBox] = await Promise.all([searchInput.boundingBox(), searchInputWrapper.boundingBox()]);
  if (!inputBox || !inputWrapperBox || Math.abs(inputBox.y - inputWrapperBox.y) > 1 || Math.abs(inputBox.height - inputWrapperBox.height) > 1) throw new Error("Search input is not aligned with its header");
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "global-search-desktop.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await page.keyboard.press("Escape");
  await searchDialog.waitFor({ state: "hidden" });
  await page.waitForTimeout(300);

  await page.keyboard.press("ControlOrMeta+K");
  await page.locator('[data-slot="command-input"]').fill("Важная мысль");
  const noteResult = page.getByRole("option", { name: /^Идеи для поездки Заметка/ });
  await noteResult.waitFor();
  await page.waitForFunction(() => document.querySelectorAll("[data-search-result]").length === 1);
  await page.screenshot({ path: path.join(output, "global-search-results-desktop.jpg"), type: "jpeg", quality: 88, fullPage: false });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/notes\?note=\d+/);
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Идеи для поездки");

  await page.keyboard.press("ControlOrMeta+K");
  await page.locator('[data-slot="command-input"]').fill("План поездки");
  await page.locator('[data-search-result^="note-"]', { hasText: "План поездки" }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "План поездки");

  await page.keyboard.press("ControlOrMeta+K");
  await page.locator('[data-slot="command-input"]').fill("40 000");
  await page.locator('[data-search-result^="transaction-"]', { hasText: "Зарплата" }).click();
  await page.waitForURL(/\/operations\?focus=\d+/);
  await page.getByRole("heading", { name: "Журнал операций", exact: true }).waitFor();
  if (await page.locator("tbody tr").count() !== 1) throw new Error("Operation deep link did not isolate the record");
  await page.getByRole("button", { name: "Сбросить фильтры", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll("tbody tr").length > 1);

  await page.keyboard.press("ControlOrMeta+K");
  await page.locator('[data-slot="command-input"]').fill("Аренда квартиры");
  await page.locator('[data-search-result^="payment-"]', { hasText: "Аренда квартиры" }).click();
  await page.waitForURL(/\/plan\?tab=payments&focus=\d+/);
  await page.locator('[id^="plan-payments-"]').filter({ hasText: "Аренда квартиры" }).waitFor();

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="expense"]').click();
  await page.getByRole("dialog", { name: "Новая операция", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-slot="dialog-content"] select')?.value === "Расход");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="income"]').click();
  await page.getByRole("dialog", { name: "Новая операция", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-slot="dialog-content"] select')?.value === "Доход");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="mood"]').click();
  await page.getByRole("dialog", { name: "Как вы себя чувствуете?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="calendar"]').click();
  await page.waitForURL(/\/calendar\?date=\d{4}-\d{2}-\d{2}/);
  await page.getByRole("heading", { name: "Финансовый календарь", exact: true }).waitFor();

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="note"]').click();
  await page.waitForURL(/\/notes\?note=\d+/);
  await page.waitForFunction(() => document.querySelector('input[aria-label="Название страницы"]')?.value === "Новая заметка");

  await page.keyboard.press("ControlOrMeta+K");
  await searchDialog.locator('[data-search-action="backup"]').click();
  await page.getByText("Резервная копия создана", { exact: true }).waitFor();
  await searchDialog.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: /Тема оформления:/ }).click();
  await page.getByRole("menuitemradio", { name: "Тёмная", exact: true }).click();
  await page.goto(`${origin}/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "analytics-dark-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });
  for (const route of ["/plan", "/mood", "/notes", "/assets", "/data"]) {
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Dark desktop horizontal overflow: ${route}`);
    await page.screenshot({ path: path.join(output, `${route.slice(1)}-dark-desktop.jpg`), type: "jpeg", quality: 82, fullPage: true });
  }
  await page.goto(`${origin}/analytics`, { waitUntil: "networkidle" });
  await page.keyboard.press("ControlOrMeta+K");
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, "global-search-dark-desktop.jpg"), type: "jpeg", quality: 88, fullPage: false });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /Тема оформления:/ }).click();
  await page.getByRole("menuitemradio", { name: "Светлая", exact: true }).click();

  await page.goto(`${origin}/data?tab=help`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "О приложении", exact: true }).waitFor();
  await page.getByText("Автор проекта — gankata", { exact: true }).waitFor();
  await page.getByText("© 2026 gankata", { exact: true }).waitFor();
  const sourceLink = page.getByRole("link", { name: "Исходный код", exact: true });
  const licenseLink = page.getByRole("link", { name: "Лицензия MIT", exact: true });
  if (await sourceLink.getAttribute("href") !== "https://github.com/gankata/tochka-opory") throw new Error("Project source link is incorrect");
  if (await licenseLink.getAttribute("href") !== "https://github.com/gankata/tochka-opory/blob/main/LICENSE") throw new Error("MIT license link is incorrect");
  const privacyLink = page.getByRole("link", { name: "Приватность · Privacy", exact: true });
  const disclaimerLink = page.getByRole("link", { name: "Ограничения ответственности · Disclaimer", exact: true });
  if (await privacyLink.getAttribute("href") !== "/PRIVACY.md" || await disclaimerLink.getAttribute("href") !== "/DISCLAIMER.md") throw new Error("Offline legal document links are incorrect");
  const [privacyDocument, disclaimerDocument] = await Promise.all([
    page.request.get(`${origin}/PRIVACY.md`),
    page.request.get(`${origin}/DISCLAIMER.md`),
  ]);
  if (!privacyDocument.ok() || !(await privacyDocument.text()).includes("## English")) throw new Error("Bilingual privacy document is unavailable offline");
  if (!disclaimerDocument.ok() || !(await disclaimerDocument.text()).includes("## English")) throw new Error("Bilingual disclaimer is unavailable offline");
  const helpCardSpacing = async () => {
    const upper = await page.getByRole("heading", { name: "Хранение наличных", exact: true }).evaluate((element) => element.closest("section").getBoundingClientRect().toJSON());
    const about = await page.getByRole("heading", { name: "О приложении", exact: true }).evaluate((element) => element.closest("section").getBoundingClientRect().toJSON());
    return about.y - (upper.y + upper.height);
  };
  const desktopHelpGap = await helpCardSpacing();
  if (desktopHelpGap < 19) throw new Error(`Help cards touch or overlap on desktop: ${desktopHelpGap}`);
  await page.screenshot({ path: path.join(output, "about-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("About section overflows on mobile");
  const mobileHelpGap = await helpCardSpacing();
  if (mobileHelpGap < 19) throw new Error(`Help cards touch or overlap on mobile: ${mobileHelpGap}`);
  await page.screenshot({ path: path.join(output, "about-mobile.jpg"), type: "jpeg", quality: 88, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`${origin}/data`, { waitUntil: "networkidle" });
  const archivePromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Полный JSON-архив", exact: true }).click();
  const archiveDownload = await archivePromise;
  const archive = JSON.parse(await fs.readFile(await archiveDownload.path(), "utf8"));
  if (archive.noteAssets?.length !== 1 || archive.noteAssets[0].data !== png.toString("base64")) throw new Error("Full archive did not preserve image bytes");
  if (!archive.notes.some((note) => note.document?.content)) throw new Error("Full archive lost rich documents");
  if (archive.settings?.incomeSchedule !== "twice" || archive.settings?.salaryDay !== 15 || archive.settings?.secondSalaryDay !== null) throw new Error("Full archive did not preserve the income schedule");

  await page.getByRole("button", { name: "Создать копию", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Название").fill("Проверочная копия");
  await dialog.getByRole("button", { name: "Создать копию", exact: true }).click();
  await page.getByText("Резервная копия создана", { exact: true }).waitFor();
  await dialog.waitFor({ state: "hidden" });

  await page.getByRole("heading", { name: "Резервное копирование работает", exact: true }).waitFor();
  const fileCopiesBefore = await page.getByRole("button", { name: "Восстановить файл", exact: true }).count();
  await page.getByRole("button", { name: "Создать SQLite-копию", exact: true }).click();
  await page.getByText("Независимая SQLite-копия создана и проверена", { exact: true }).waitFor();
  await page.waitForFunction((before) => Array.from(document.querySelectorAll("button")).filter((button) => button.textContent === "Восстановить файл").length === before + 1, fileCopiesBefore);
  await captureGuideImages(page, "06-backup");

  await page.goto(`${origin}/data?tab=imports`, { waitUntil: "networkidle" });
  await page.getByLabel("Название", { exact: true }).fill("Кофейни");
  await page.getByLabel("Текст для поиска", { exact: true }).fill("coffee");
  await page.getByLabel("Новая категория", { exact: true }).fill("Кафе");
  await page.getByRole("button", { name: "Добавить правило", exact: true }).click();
  await page.getByText("Правило добавлено", { exact: true }).waitFor();
  const rulesPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт", exact: true }).click();
  const rulesDownload = await rulesPromise;
  const rulePack = JSON.parse(await fs.readFile(await rulesDownload.path(), "utf8"));
  if (rulePack.format !== "tochka-opory.rules" || rulePack.rules[0].pattern !== "coffee") throw new Error("Declarative rule export failed");
  await page.locator('input[type="file"][accept*=".csv"]').setInputFiles({ name: "bank.csv", mimeType: "text/csv", buffer: Buffer.from("date,amount,type,note\n2026-11-06,99,Расход,coffee") });
  await page.getByRole("button", { name: "Импортировать 1", exact: true }).click();
  await page.getByText("Добавлено: 1. Дублей пропущено: 0", { exact: true }).waitFor();
  await page.getByText("bank.csv", { exact: true }).waitFor();

  await page.goto(`${origin}/assets`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Добавить позицию", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Название", { exact: true }).fill("Тестовый вклад");
  await page.getByLabel("Текущая оценка, ₽").fill("12500");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Оценка сохранена", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Добавить позицию", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Название", { exact: true }).fill("Тестовый долг");
  await page.getByRole("dialog").locator("select").first().selectOption("liability");
  await page.getByLabel("Текущая оценка, ₽").fill("2500");
  await page.getByRole("dialog").getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByText("Оценка сохранена", { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('section[aria-label="Итоги капитала"]')?.textContent?.replace(/\s/g, "").includes("10000₽"));
  const capital = await page.locator('section[aria-label="Итоги капитала"]').innerText();
  if (!capital.replace(/\s/g, "").includes("10000₽")) throw new Error(`Net capital calculation is wrong: ${capital}`);
  await page.waitForFunction(() => Array.from(document.querySelectorAll("[data-sonner-toast]")).every((toast) => Number(getComputedStyle(toast).opacity) === 1));
  await assertAccessible(page, "assets-filled-desktop");
  await page.screenshot({ path: path.join(output, "assets-filled-desktop.jpg"), type: "jpeg", quality: 88, fullPage: true });

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await page.getByLabel("Название токена", { exact: true }).fill("Проверочный API");
  await page.getByLabel("Права", { exact: true }).selectOption("write");
  await page.getByRole("button", { name: "Создать токен", exact: true }).click();
  const tokenValue = await page.getByLabel("Новый токен API", { exact: true }).innerText();
  if (!tokenValue.startsWith("top_")) throw new Error("API token was not shown");
  const noToken = await page.request.get(`${origin}/api/v1/transactions`);
  if (noToken.status() !== 401) throw new Error("Public API is open without a token");
  const authorized = await page.request.get(`${origin}/api/v1/transactions?limit=2`, { headers: { Authorization: `Bearer ${tokenValue}` } });
  if (!authorized.ok() || (await authorized.json()).items.length !== 2) throw new Error("Authorized API read failed");
  const apiOperation = { operationDate: "2026-11-06", type: "Доход", category: "API", amountRub: 77, originalAmount: 77, currency: "RUB", exchangeRate: 1, clientId: crypto.randomUUID() };
  const apiCreated = await page.request.post(`${origin}/api/v1/transactions`, { headers: { Authorization: `Bearer ${tokenValue}` }, data: apiOperation });
  if (apiCreated.status() !== 201) throw new Error(`API create failed: ${await apiCreated.text()}`);
  const apiRepeated = await page.request.post(`${origin}/api/v1/transactions`, { headers: { Authorization: `Bearer ${tokenValue}` }, data: apiOperation });
  if (!(await apiRepeated.json()).idempotent) throw new Error("API idempotency failed");
  await page.getByRole("button", { name: "Отозвать", exact: true }).click();
  await page.getByText("Доступ по токену отозван", { exact: true }).waitFor();
  const revoked = await page.request.get(`${origin}/api/v1/transactions`, { headers: { Authorization: `Bearer ${tokenValue}` } });
  if (revoked.status() !== 401) throw new Error("Revoked token still works");

  secondContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: browserName !== "firefox",
  });
  await secondContext.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", { configurable: true, value: undefined });
    const originalConsoleError = console.error.bind(console);
    console.error = (...values) => {
      const readable = values.map((value) => {
        if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ""}`;
        if (typeof value === "object") {
          try { return JSON.stringify(value); } catch { return String(value); }
        }
        return String(value);
      });
      originalConsoleError(...readable);
    };
  });
  const phone = await secondContext.newPage();
  const lanErrors = [];
  const lanBadResponses = [];
  phone.on("console", (message) => { if (message.type() === "error") lanErrors.push(message.text()); });
  phone.on("pageerror", (error) => lanErrors.push(error.stack ?? error.message));
  phone.on("response", (response) => { if (response.status() >= 400) lanBadResponses.push(`${response.status()} ${response.url()}`); });
  await phone.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await phone.getByLabel("Логин", { exact: true }).fill("tester");
  await phone.locator('input[autocomplete="current-password"]').fill("first-local-password");
  await phone.getByRole("button", { name: "Войти", exact: true }).click();
  await phone.waitForURL(`${origin}/`);
  await phone.getByRole("heading", { name: "Всё важное — на одном экране", exact: true }).waitFor();

  if (await phone.evaluate(() => typeof crypto.randomUUID !== "undefined")) throw new Error("The LAN compatibility scenario must disable randomUUID");
  await phone.goto(`${origin}/operations?new=1&date=2026-11-10`, { waitUntil: "networkidle" });
  const lanOperationDialog = phone.getByRole("dialog", { name: "Новая операция", exact: true });
  await lanOperationDialog.getByRole("combobox", { name: "Категория", exact: true }).click();
  await phone.getByRole("option", { name: "Еда", exact: true }).click();
  await lanOperationDialog.getByLabel("Сумма, ₽", { exact: true }).fill("1.25");
  await lanOperationDialog.getByLabel("Комментарий", { exact: true }).fill("Проверка HTTP без randomUUID");
  await lanOperationDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
  await lanOperationDialog.waitFor({ state: "hidden" });
  await phone.getByText("Операция сохранена", { exact: true }).waitFor();
  await phone.locator("article").filter({ hasText: "Проверка HTTP без randomUUID" }).waitFor();
  if (await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("LAN transaction causes horizontal overflow");
  await phone.screenshot({ path: path.join(output, "phone-transaction-without-random-uuid.jpg"), type: "jpeg", quality: 90 });
  await phone.waitForTimeout(100);
  if (lanErrors.length || lanBadResponses.length) {
    throw new Error(`LAN transaction browser gate failed: ${JSON.stringify({ lanErrors, lanBadResponses })}`);
  }
  console.log("LAN HTTP transaction without randomUUID: OK");

  await page.goto(`${origin}/data?tab=settings`, { waitUntil: "networkidle" });
  await page.getByLabel("Текущий пароль", { exact: true }).fill("first-local-password");
  await page.locator('input[autocomplete="new-password"]').nth(0).fill("second-local-password");
  await page.locator('input[autocomplete="new-password"]').nth(1).fill("second-local-password");
  await page.getByRole("button", { name: "Сменить пароль", exact: true }).click();
  await page.getByText(/Пароль изменён/).waitFor();
  await phone.goto(`${origin}/`, { waitUntil: "networkidle" });
  await phone.getByText("Вход в ваше пространство", { exact: true }).waitFor();
  await secondContext.close();
  secondContext = undefined;

  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  try {
    await page.getByText("Вход в ваше пространство", { exact: true }).waitFor({ timeout: 5000 });
  } catch (error) {
    console.error("logoutFailure", JSON.stringify({ url: page.url(), body: await page.locator("body").innerText(), errors, badResponses, serverLogs }));
    await page.screenshot({ path: path.join(output, "logout-failure.jpg"), type: "jpeg", quality: 85, fullPage: true });
    throw error;
  }
  await page.getByLabel("Логин", { exact: true }).fill("tester");
  await page.locator('input[autocomplete="current-password"]').fill("second-local-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.getByRole("heading", { name: "Всё важное — на одном экране", exact: true }).waitFor();

  await resetPassword("reset-local-password");
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByText("Вход в ваше пространство", { exact: true }).waitFor();
  await page.getByLabel("Логин", { exact: true }).fill("tester");
  await page.locator('input[autocomplete="current-password"]').fill("reset-local-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.getByRole("heading", { name: "Всё важное — на одном экране", exact: true }).waitFor();
  errors.length = 0;
  badResponses.length = 0;

  await page.setViewportSize({ width: 375, height: 812 });
  const mobileNav = page.getByRole("navigation", { name: "Мобильная навигация", exact: true });
  await mobileNav.waitFor();
  const mobileTargetCount = await mobileNav.locator("a, button").count();
  if (mobileTargetCount !== 5) throw new Error(`Mobile navigation should contain five comfortable targets, received ${mobileTargetCount}`);
  for (const route of ["/", "/operations", "/analytics", "/plan", "/calendar", "/mood", "/notes", "/assets", "/data"]) {
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    if (route === "/notes") await page.getByRole("button", { name: "Идеи для поездки", exact: true }).click();
    if (route === "/mood") {
      const positions = await page.locator(".mood-insights-grid").evaluate((grid) => ["Динамика", "Календарь", "Ритм недели", "Что наблюдается вместе"].map((title) => {
        const section = [...grid.children].find((child) => child.querySelector("h2")?.textContent?.trim() === title);
        if (!section) throw new Error(`Mobile mood section is missing: ${title}`);
        const box = section.getBoundingClientRect();
        return { title, x: box.x, y: box.y, width: box.width };
      }));
      if (!positions.every((position, index) => index === 0 || position.y > positions[index - 1].y)) throw new Error("Mobile mood order must remain chart, calendar, rhythm, correlations");
      if (positions.some((position) => Math.abs(position.x - positions[0].x) > 1 || Math.abs(position.width - positions[0].width) > 1)) throw new Error("Mobile mood sections must form one aligned column");
      await page.screenshot({ path: path.join(output, "mood-layout-mobile.jpg"), type: "jpeg", quality: 90, fullPage: true });
    }
    if (route === "/analytics") {
      await cashFlowAlert.waitFor();
      await unconfirmedIncomeSchedule.waitFor();
      if (await unconfirmedIncomeSchedule.locator("li").count() < 1) throw new Error("Mobile forecast must retain scheduled payday labels");
      await page.getByText("0 ₽ — граница бюджета", { exact: true }).waitFor();
      await deficitArea.waitFor();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Cash-flow deficit warning overflows on mobile");
      await page.waitForTimeout(650);
      await assertAccessible(page, "analytics-cash-flow-negative-mobile");
      await page.screenshot({ path: path.join(output, "analytics-cash-flow-negative-mobile.jpg"), type: "jpeg", quality: 90, fullPage: true });
      await page.getByRole("button", { name: "Сохранить новое", exact: true }).click();
      const mobileSavedViewDialog = page.getByRole("dialog", { name: "Сохранить представление", exact: true });
      await mobileSavedViewDialog.getByLabel("Название представления", { exact: true }).fill("Мобильное представление");
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(output, "analytics-save-view-dialog-mobile.jpg"), type: "jpeg", quality: 90, fullPage: false });
      await mobileSavedViewDialog.getByRole("button", { name: "Сохранить", exact: true }).click();
      await mobileSavedViewDialog.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.querySelector('[aria-label="Сохранённые представления"]')?.textContent?.includes("Мобильное представление"));
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, "analytics-active-saved-view-mobile.jpg"), type: "jpeg", quality: 90, fullPage: true });
      await page.getByRole("button", { name: /^Еда / }).click();
      await page.getByText("Продукты на неделю", { exact: true }).last().waitFor();
      const expandedCategoryId = await page.getByRole("button", { name: /^Еда / }).getAttribute("aria-controls");
      if (!expandedCategoryId) throw new Error("Expanded category has no details id");
      const clippedDetails = await page.locator(`#${expandedCategoryId}`).evaluate((element) => {
        const parent = element.getBoundingClientRect();
        return Array.from(element.children).filter((child) => {
          const box = child.getBoundingClientRect();
          return box.right > parent.right + 1 || child.scrollWidth > child.clientWidth + 1;
        }).map((child) => ({ className: child.className, width: child.getBoundingClientRect().width, scrollWidth: child.scrollWidth, clientWidth: child.clientWidth }));
      });
      if (clippedDetails.length) throw new Error(`Mobile category details are clipped: ${JSON.stringify(clippedDetails)}`);
      await page.waitForTimeout(550);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) {
      const details = await page.evaluate(() => ({
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        offenders: Array.from(document.querySelectorAll("body *")).filter((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
        }).slice(0, 20).map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 120), rect: element.getBoundingClientRect().toJSON() })),
      }));
      await page.screenshot({ path: path.join(output, "mobile-overflow-failure.jpg"), type: "jpeg", quality: 90, fullPage: true });
      throw new Error(`Mobile horizontal overflow: ${route}: ${JSON.stringify(details)}`);
    }
    await page.screenshot({ path: path.join(output, `${route === "/" ? "dashboard" : route.slice(1)}-mobile.jpg`), type: "jpeg", quality: 85, fullPage: true });
  }

  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  const guideMorePanel = page.getByRole("dialog", { name: "Другие разделы", exact: true });
  await guideMorePanel.getByRole("button", { name: "Открыть руководство", exact: true }).click();
  await guideDialog.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".guide-image");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  await page.waitForTimeout(350);
  await assertAccessible(page, "guide-mobile");
  await assertGuideCloseClearance(guideDialog, "mobile");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mobile guide horizontal overflow");
  await page.screenshot({ path: path.join(output, "guide-step-mobile.jpg"), type: "jpeg", quality: 90 });
  await guideDialog.getByRole("button", { name: /^Увеличить изображение:/ }).click();
  await imageViewer.waitFor();
  await page.waitForTimeout(350);
  await assertGuideImageFit(imageViewer, "mobile");
  await page.screenshot({ path: path.join(output, "guide-image-viewer-mobile.jpg"), type: "jpeg", quality: 90 });
  await imageViewer.getByRole("button", { name: "Приблизить", exact: true }).click();
  await imageViewer.getByText("125%", { exact: true }).waitFor();
  const mobileViewerBox = await imageViewer.boundingBox();
  if (!mobileViewerBox || mobileViewerBox.x < 0 || mobileViewerBox.x + mobileViewerBox.width > 375 || mobileViewerBox.height > 812) throw new Error("Mobile guide image viewer is clipped");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mobile guide image viewer causes horizontal overflow");
  await page.screenshot({ path: path.join(output, "guide-image-viewer-zoom-mobile.jpg"), type: "jpeg", quality: 90 });
  await imageViewer.press("Escape");
  await imageViewer.waitFor({ state: "hidden" });
  const guideScroll = guideDialog.locator(".grid.min-h-0");
  const guideScrolled = await guideScroll.evaluate((element) => {
    if (element.scrollHeight <= element.clientHeight) return false;
    element.scrollTop = element.scrollHeight;
    return element.scrollTop > 0;
  });
  if (!guideScrolled) throw new Error("Long mobile guide content is not scrollable");
  await guideDialog.getByRole("button", { name: "Указать остатки", exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "guide-step-scrolled-mobile.jpg"), type: "jpeg", quality: 90 });
  await guideScroll.evaluate((element) => { element.scrollTop = 0; });
  await guideDialog.getByRole("button", { name: "Далее", exact: true }).click();
  await guideDialog.getByText("2 из 6", { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".guide-image");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  await page.screenshot({ path: path.join(output, "guide-step-two-mobile.jpg"), type: "jpeg", quality: 90 });
  await guideDialog.getByRole("button", { name: "Открыть операции", exact: true }).click();
  await page.waitForURL(`${origin}/operations`);
  await guideDialog.waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Журнал операций", exact: true }).waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mobile guide link destination horizontal overflow");
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  for (const [route, label, heading] of [
    ["/analytics", "Аналитика", "Закономерности в ваших деньгах"],
    ["/calendar", "Календарь", "Финансовый календарь"],
    ["/plan", "План", "План, который можно уточнять"],
    ["/assets", "Капитал", "Активы и обязательства"],
    ["/data", "Данные", "Ваши данные остаются вашими"],
  ]) {
    await page.getByRole("button", { name: "Ещё", exact: true }).click();
    const morePanel = page.getByRole("dialog", { name: "Другие разделы", exact: true });
    await morePanel.waitFor();
    if (route === "/analytics") {
      await page.waitForTimeout(550);
      await page.screenshot({ path: path.join(output, "mobile-more.jpg"), type: "jpeg", quality: 90, fullPage: false });
    }
    await morePanel.getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL(`${origin}${route}`);
    await morePanel.waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  await mobileNav.getByRole("link", { name: "Заметки", exact: true }).click();
  await page.waitForURL(`${origin}/notes`);
  await page.getByRole("heading", { name: "Заметки и желания", exact: true }).waitFor();

  for (const width of [768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/operations", "/analytics", "/plan", "/calendar", "/mood", "/notes", "/assets", "/data"]) {
      await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`Horizontal overflow at ${width}: ${route}`);
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Поиск и быстрые действия", exact: true }).click();
  const mobileSearch = page.getByRole("dialog", { name: "Глобальный поиск", exact: true });
  await mobileSearch.waitFor();
  await page.locator('[data-slot="command-input"]').fill("Поездка к друзьям");
  await page.locator('[data-search-result^="wish-"]', { hasText: "Поездка к друзьям" }).waitFor();
  await page.waitForTimeout(300);
  const mobileSearchBox = await mobileSearch.boundingBox();
  if (!mobileSearchBox || mobileSearchBox.x < 0 || mobileSearchBox.x + mobileSearchBox.width > 375 || mobileSearchBox.height > 812) throw new Error("Mobile search is clipped");
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Mobile search causes horizontal overflow");
  await page.screenshot({ path: path.join(output, "global-search-mobile.jpg"), type: "jpeg", quality: 90, fullPage: false });
  await page.getByRole("button", { name: "Закрыть поиск", exact: true }).click();
  await mobileSearch.waitFor({ state: "hidden" });

  await page.goto(`${origin}/mood`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Новая запись", exact: true }).first().click();
  await page.getByRole("button", { name: /^Дата, обязательное поле:/ }).click();
  const mobileCalendar = page.locator(".date-picker-popover");
  await mobileCalendar.waitFor();
  await page.waitForTimeout(250);
  const mobileCalendarBox = await mobileCalendar.boundingBox();
  if (!mobileCalendarBox || mobileCalendarBox.x < 0 || mobileCalendarBox.x + mobileCalendarBox.width > 375) throw new Error("Mobile calendar is clipped");
  await page.screenshot({ path: path.join(output, "date-picker-mood-mobile.jpg"), type: "jpeg", quality: 88, fullPage: false });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedDuration = await page.locator(".page-enter > *").first().evaluate((element) => getComputedStyle(element).animationDuration);
  const reducedSeconds = reducedDuration.endsWith("ms") ? parseFloat(reducedDuration) / 1000 : parseFloat(reducedDuration);
  if (reducedSeconds > 0.00001) throw new Error(`Reduced motion was not respected: ${reducedDuration}`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Поиск и быстрые действия", exact: true }).click();
  const reducedPalette = page.getByRole("dialog", { name: "Глобальный поиск", exact: true });
  await reducedPalette.waitFor();
  const paletteDuration = await reducedPalette.evaluate((element) => getComputedStyle(element).animationDuration);
  const paletteSeconds = paletteDuration.endsWith("ms") ? parseFloat(paletteDuration) / 1000 : parseFloat(paletteDuration);
  if (paletteSeconds > 0.00001) throw new Error(`Palette reduced motion was not respected: ${paletteDuration}`);
  await page.getByRole("button", { name: "Закрыть поиск", exact: true }).click();

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/`, { waitUntil: "networkidle" });
  const detailsButton = page.getByRole("button", { name: "Подробный обзор", exact: true });
  if (await detailsButton.count()) await detailsButton.click();
  await assertPracticalFeatureHints(page, "dashboard");
  await page.getByRole("button", { name: "Настроить главную", exact: true }).click();
  await assertPracticalFeatureHints(page, "dashboard-customizing");

  for (const route of ["/operations", "/mood", "/notes", "/analytics", "/calendar", "/assets"]) {
    await page.goto(`${origin}${route}`, { waitUntil: "networkidle" });
    await assertPracticalFeatureHints(page, route);
  }

  await page.goto(`${origin}/notes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Граф связей", exact: true }).click();
  await assertPracticalFeatureHints(page, "notes-graph");

  for (const tab of ["payments", "envelopes", "goals", "wallet"]) {
    await page.goto(`${origin}/plan?tab=${tab}`, { waitUntil: "networkidle" });
    await assertPracticalFeatureHints(page, `plan-${tab}`);
  }
  for (const tab of ["backups", "imports", "settings", "reminders", "options", "help"]) {
    await page.goto(`${origin}/data?tab=${tab}`, { waitUntil: "networkidle" });
    await assertPracticalFeatureHints(page, `data-${tab}`);
  }

  await page.goto(`${origin}/mood`, { waitUntil: "networkidle" });
  const moodCalendarHint = page.getByRole("button", { name: "Подсказка: Календарь", exact: true });
  await moodCalendarHint.scrollIntoViewIfNeeded();
  await moodCalendarHint.focus();
  await page.keyboard.press("Enter");
  const moodCalendarContent = page.locator('[data-feature-hint-content][data-state="open"]');
  await moodCalendarContent.getByText("Повторное нажатие на выбранный день или кнопка «Все дни» снимет фильтр.", { exact: false }).waitFor();
  await moodCalendarContent.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await assertAccessible(page, "mood-calendar-hint-desktop");
  await page.screenshot({ path: path.join(output, "feature-hint-mood-calendar-desktop.jpg"), type: "jpeg", quality: 92, animations: "disabled" });
  await page.keyboard.press("Escape");
  await moodCalendarContent.waitFor({ state: "hidden" });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${origin}/mood`, { waitUntil: "networkidle" });
  await assertPracticalFeatureHints(page, "mood-mobile");
  await moodCalendarHint.scrollIntoViewIfNeeded();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await moodCalendarHint.focus();
  await page.keyboard.press("Enter");
  await moodCalendarContent.waitFor();
  await moodCalendarContent.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const mobileHintBox = await moodCalendarContent.boundingBox();
  if (!mobileHintBox || mobileHintBox.x < 0 || mobileHintBox.x + mobileHintBox.width > 375 || mobileHintBox.y < 0 || mobileHintBox.y + mobileHintBox.height > 812) throw new Error("Mobile mood hint is clipped");
  await assertAccessible(page, "mood-calendar-hint-mobile");
  await page.screenshot({ path: path.join(output, "feature-hint-mood-calendar-mobile.jpg"), type: "jpeg", quality: 92, animations: "disabled" });
  await page.keyboard.press("Escape");
  await moodCalendarContent.waitFor({ state: "hidden" });

  console.log("consoleErrors", JSON.stringify(errors));
  console.log("badResponses", JSON.stringify(badResponses));
  if (errors.length || badResponses.length) throw new Error("Browser release gate failed");
  console.log("Auth, guide links, practical feature hints in every section, rich notes, exports, global search, quick actions, deep links, backup and mobile layout: OK");
} finally {
  if (secondContext) await secondContext.close();
  if (browser) await browser.close();
  server.kill("SIGTERM");
  if (server.exitCode === null) await new Promise((resolve) => server.once("exit", resolve));
}
