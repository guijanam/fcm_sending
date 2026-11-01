import { beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({})),
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn(async () => {}),
  signInWithPopup: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  onAuthStateChanged: vi.fn(() => () => {}),
  getFunctions: vi.fn(() => ({})),
  httpsCallable: vi.fn((_functions: unknown, _name: string) =>
    vi.fn(async () => ({ data: { items: [] } })),
  ),
}));
vi.mock("firebase/app", () => ({ initializeApp: sdk.initializeApp }));
vi.mock("firebase/auth", () => ({
  ...sdk,
  browserLocalPersistence: "LOCAL",
  GoogleAuthProvider: class {},
}));
vi.mock("firebase/functions", () => sdk);
import { loadApi } from "../firebase";
const config = {
  apiKey: "test-key",
  appId: "test-app",
  projectId: "mydia-29ac2",
  authDomain: "mydia-29ac2.firebaseapp.com",
  messagingSenderId: "188406916055",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => config })),
  );
});
it("fetches relative public config without cache", async () => {
  await loadApi();
  expect(fetch).toHaveBeenCalledWith(
    `${import.meta.env.BASE_URL}firebase-config.json`,
    { cache: "no-store" },
  );
});
it("does not initialize Firebase with missing configuration", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...config, apiKey: "" }),
    })),
  );
  expect(await loadApi()).toBeNull();
  expect(sdk.initializeApp).not.toHaveBeenCalled();
});
it("uses local persistence, popup login and Seoul callable endpoints", async () => {
  const api = await loadApi();
  expect(api).not.toBeNull();
  await api!.login();
  expect(sdk.setPersistence).toHaveBeenCalledWith({}, "LOCAL");
  expect(sdk.signInWithPopup).toHaveBeenCalledOnce();
  expect(sdk.getFunctions).toHaveBeenCalledWith({}, "asia-northeast3");
  await api!.status();
  await api!.list();
  await api!.send({ title: "a", body: "b", requestId: "id", dryRun: true });
  expect(sdk.httpsCallable.mock.calls.map((c) => c[1])).toEqual([
    "fcmAdminStatus",
    "fcmListAnnouncements",
    "fcmSendAnnouncement",
  ]);
});
it("fails closed on missing config file", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("offline");
    }),
  );
  expect(await loadApi()).toBeNull();
});
