import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";
import { shouldRenderMainRoutes } from "./ui/bootGateState";

describe("App shell titlebar", () => {
  it("renders an explicit right-side drag spacer region", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain("window-drag-region-spacer");
    expect(markup).toContain("data-tauri-drag-region");
  });

  it("shows startup gate screen before main routes are available", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain("Checking application version...");
    expect(markup).not.toContain("Dashboard</a>");
    expect(markup).not.toContain("Items</a>");
  });

  it("renders main routes only when boot state is OK", () => {
    expect(shouldRenderMainRoutes("boot-loading")).toBe(false);
    expect(shouldRenderMainRoutes("boot-error")).toBe(false);
    expect(shouldRenderMainRoutes("boot-outdated")).toBe(false);
    expect(shouldRenderMainRoutes("boot-ok")).toBe(true);
  });
});
