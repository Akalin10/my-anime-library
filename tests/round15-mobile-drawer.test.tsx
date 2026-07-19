// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { AppSidebar } from "@/components/layout/AppSidebar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => root.unmount());
  }
  document.body.innerHTML = "";
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 10));
  });
}

describe("round 15 mobile navigation drawer", () => {
  it("opens, traps focus, closes with Escape, and restores focus", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <AppSidebar
          activeFilter="ALL"
          counts={{ all: 0, watching: 0, completed: 0 }}
          onFilterChange={() => undefined}
          onOpenSettings={() => undefined}
          settingsActive={false}
        />,
      );
    });

    const menu = container.querySelector<HTMLButtonElement>(
      'button[aria-label="打开导航"]',
    );
    expect(menu).toBeTruthy();
    act(() => menu?.click());
    await settle();

    const drawer = container.querySelector<HTMLElement>('[role="dialog"]');
    const drawerButtons = Array.from(
      drawer!.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    expect(drawer?.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(drawerButtons[0]);

    drawerButtons.at(-1)?.focus();
    act(() => {
      drawerButtons.at(-1)?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(drawerButtons[0]);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    await settle();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});
