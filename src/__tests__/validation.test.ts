import { describe, it, expect } from "vitest";
import { validateAnnouncement } from "../validation";
describe("announcement validation", () => {
  it("requires meaningful title and body", () => {
    expect(validateAnnouncement(" ", "a")).toBeTruthy();
    expect(validateAnnouncement("a", " ")).toBeTruthy();
  });
  it("counts Unicode points rather than UTF16 units", () => {
    expect(validateAnnouncement("😀".repeat(80), "내용")).toBeNull();
    expect(validateAnnouncement("😀".repeat(81), "내용")).toBeTruthy();
    expect(validateAnnouncement("제목", "가".repeat(1001))).toBeTruthy();
  });
  it.each([2048, 2049])("checks the full ASCII JSON boundary at %i bytes", (bytes) => {
    const title = "a";
    // Newlines are ASCII but take two bytes each when JSON-escaped.
    const body = "\n".repeat(965) + (bytes === 2048 ? "aa" : "aaa");
    const message = { topic: "documents", notification: { title, body }, android: { notification: { channelId: "fcm_messages" } } };
    expect(new TextEncoder().encode(JSON.stringify(message)).length).toBe(bytes);
    expect(validateAnnouncement(title, body)).toBe(bytes === 2048 ? null : "알림 데이터가 너무 큽니다. 이모지나 내용을 줄여 주세요.");
  });
  it("rejects Korean text below the character limit but above the topic byte limit", () => {
    expect(validateAnnouncement("a", "가".repeat(700))).toBeTruthy();
  });
  it("includes the full Android FCM envelope in the UTF8 budget", () => {
    expect(validateAnnouncement("a".repeat(80), "😀".repeat(827))).toBeTruthy();
  });
  it("rejects invalid Unicode and excessive UTF8 payload", () => {
    expect(validateAnnouncement("a", "\ud800")).toBeTruthy();
    expect(
      validateAnnouncement("😀".repeat(80), "😀".repeat(1000)),
    ).toBeTruthy();
  });
});
