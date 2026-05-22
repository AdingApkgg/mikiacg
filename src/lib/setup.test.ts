import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  memDelete: vi.fn(),
}));

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/lib/memory-cache", () => ({
  memGetOrSet: async <T>(_key: string, fetcher: () => Promise<T>) => fetcher(),
  memDelete: mocks.memDelete,
}));

import { invalidateSetupCache, isSetupComplete } from "@/lib/setup";

describe("isSetupComplete", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.memDelete.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("returns true when an OWNER user exists", async () => {
    mocks.findFirst.mockResolvedValue({ id: "owner-id" });

    await expect(isSetupComplete()).resolves.toBe(true);
  });

  it("returns false when no OWNER user exists", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(isSetupComplete()).resolves.toBe(false);
  });

  it("logs and rethrows database errors", async () => {
    const error = new Error("database is unavailable");
    mocks.findFirst.mockRejectedValue(error);

    await expect(isSetupComplete()).rejects.toThrow(error);
    expect(consoleError).toHaveBeenCalledWith("[setup] Failed to check setup status", error);
  });

  it("invalidates the setup cache", () => {
    invalidateSetupCache();

    expect(mocks.memDelete).toHaveBeenCalledWith("setup:complete");
  });
});
