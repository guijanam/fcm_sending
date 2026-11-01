import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import App from "../App";
import type { AdminApi, Identity } from "../api";
function apiMock(overrides: Partial<AdminApi> = {}) {
  const api: AdminApi = {
    subscribe: vi.fn((cb) => {
      cb({ uid: "1", email: "admin@example.test" });
      return () => {};
    }),
    login: vi.fn(async () => {}),
    logout: vi.fn(async () => {}),
    status: vi.fn(async () => ({
      topic: "documents",
      projectId: "mydia-29ac2",
      email: "admin@example.test",
    })),
    list: vi.fn(async () => ({ items: [] })),
    send: vi.fn(async (v) => ({
      requestId: v.requestId,
      status: "accepted" as const,
    })),
    ...overrides,
  };
  return api;
}
describe("access boundaries", () => {
  it("shows a real backend-pending state without login, authorization calls or sending", () => {
    const api = apiMock({backendReady:false});
    render(<App api={api} />);
    expect(screen.getByRole("heading", {name:"발송 서버 배포 대기"})).toBeVisible();
    expect(screen.getByText(/웹 앱 설정은 연결되었습니다/)).toBeVisible();
    expect(screen.queryByRole("button", {name:"Google로 로그인"})).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(api.subscribe).not.toHaveBeenCalled();
    expect(api.status).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.send).not.toHaveBeenCalled();
  });
  it("shows actionable setup rather than a pretend dashboard without config", () => {
    render(<App api={null} />);
    expect(
      screen.getByRole("heading", { name: "알림 센터 연결하기" }),
    ).toBeVisible();
    expect(screen.getByText(/FIREBASE_WEB_CONFIG/)).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("waits for the server before showing the editor", async () => {
    let resolve!: (v: any) => void;
    const api = apiMock({
      status: vi.fn(
        () =>
          new Promise<{ topic: string; projectId: string; email: string }>(
            (r) => {
              resolve = r;
            },
          ),
      ),
    });
    render(<App api={api} />);
    expect(
      await screen.findByText("관리자 권한을 확인하고 있습니다."),
    ).toBeVisible();
    expect(screen.queryByLabelText("알림 제목")).not.toBeInTheDocument();
    resolve({ topic: "documents", projectId: "mydia-29ac2", email: "a" });
    expect(await screen.findByLabelText("알림 제목")).toBeVisible();
  });
  it("invalidates outstanding authorization when the auth observer fails", async () => {
    let fail!: (e: unknown) => void;
    let resolve!: (v: {
      topic: string;
      projectId: string;
      email: string;
    }) => void;
    const api = apiMock({
      subscribe: (cb, onError) => {
        fail = onError;
        cb({ uid: "1", email: "a" });
        return () => {};
      },
      status: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    render(<App api={api} />);
    await screen.findByText("관리자 권한을 확인하고 있습니다.");
    fail(new Error("auth disconnected"));
    resolve({ topic: "documents", projectId: "mydia-29ac2", email: "a" });
    await screen.findByRole("heading", { name: "연결을 확인해 주세요" });
    expect(screen.queryByLabelText("알림 제목")).not.toBeInTheDocument();
  });
  it("denies unverified accounts and offers logout", async () => {
    const api = apiMock({
      status: vi.fn(async () => {
        throw { code: "functions/permission-denied" };
      }),
    });
    render(<App api={api} />);
    expect(
      await screen.findByRole("heading", { name: "접근 권한이 없습니다" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(api.logout).toHaveBeenCalledOnce();
  });
  it("shows Google login only when signed out", async () => {
    const api = apiMock({
      subscribe: (cb) => {
        cb(null);
        return () => {};
      },
    });
    render(<App api={api} />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Google로 로그인" }),
    );
    expect(api.login).toHaveBeenCalledOnce();
  });
});
async function compose(api = apiMock()) {
  render(<App api={api} />);
  const title = await screen.findByLabelText("알림 제목");
  await userEvent.type(title, "공지 제목");
  await userEvent.type(screen.getByLabelText("알림 내용"), "공지 내용");
  return api;
}
describe("safe announcement workflow", () => {
  it("shows server-only empty history and live text preview", async () => {
    await compose();
    expect(await screen.findByText("아직 발송 기록이 없습니다.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "공지 제목" })).toBeVisible();
  });
  it("blocks review on invalid input", async () => {
    render(<App api={apiMock()} />);
    await screen.findByLabelText("알림 제목");
    await userEvent.click(screen.getByRole("button", { name: "발송 전 검토" }));
    expect(screen.getByRole("alert")).toHaveTextContent("제목과 내용을");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cancels and escapes without sending, restoring focus", async () => {
    const api = await compose();
    const review = screen.getByRole("button", { name: "발송 전 검토" });
    await userEvent.click(review);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "전체 공지 발송" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(api.send).not.toHaveBeenCalled();
    expect(review).toHaveFocus();
    await userEvent.click(review);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("requires explicit confirmation and sends exactly once", async () => {
    const api = await compose();
    await userEvent.click(screen.getByRole("button", { name: "발송 전 검토" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.dblClick(
      screen.getByRole("button", { name: "전체 공지 발송" }),
    );
    expect(api.send).toHaveBeenCalledOnce();
    expect(api.send).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "공지 제목",
        body: "공지 내용",
        dryRun: false,
        requestId: expect.any(String),
      }),
    );
    expect(await screen.findByText(/FCM 접수 완료/)).toBeVisible();
  });
  it("validates without sending a real notification", async () => {
    const api = await compose();
    await userEvent.click(screen.getByRole("button", { name: "테스트 검증" }));
    expect(api.send).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });
  it("retains request ID on uncertain response and never automatically retries", async () => {
    const api = await compose(
      apiMock({
        send: vi.fn(async () => {
          throw { code: "functions/deadline-exceeded" };
        }),
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "테스트 검증" }));
    expect(
      await screen.findByText(/처리 상태를 확인할 수 없습니다/),
    ).toBeVisible();
    const first = vi.mocked(api.send).mock.calls[0][0];
    expect(api.send).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("알림 제목")).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "동일 요청 상태 확인" }),
    );
    expect(vi.mocked(api.send).mock.calls[1][0]).toEqual(first);
  });
  it.each([
    "permission-denied",
    "unauthenticated",
    "invalid-argument",
    "failed-precondition",
    "resource-exhausted",
  ])("keeps an uncertain live send locked after a %s retry rejection", async (code) => {
    const send = vi.fn<AdminApi["send"]>()
      .mockRejectedValueOnce({ code: "functions/deadline-exceeded" })
      .mockRejectedValueOnce({ code: `functions/${code}` })
      .mockImplementation(async (input) => ({
        requestId: input.requestId,
        status: "accepted",
      }));
    await compose(apiMock({ send }));
    await userEvent.click(screen.getByRole("button", { name: "발송 전 검토" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "전체 공지 발송" }));
    const original = send.mock.calls[0][0];
    expect(original.dryRun).toBe(false);
    await userEvent.click(await screen.findByRole("button", { name: "동일 요청 상태 확인" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "발송 전 검토" })).toHaveTextContent("발송 전 검토");
      expect(screen.getByLabelText("알림 제목")).toBeDisabled();
    });
    expect(screen.getByLabelText("알림 내용")).toBeDisabled();
    expect(screen.getByRole("button", { name: "테스트 검증" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "발송 전 검토" })).toBeDisabled();
    expect(screen.getByText(`요청 ID: ${original.requestId}`)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "테스트 검증" }));
    fireEvent.submit(screen.getByLabelText("알림 제목").closest("form")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(send.mock.calls.map(([input]) => input)).toEqual([original, original]);

    await userEvent.click(screen.getByRole("button", { name: "동일 요청 상태 확인" }));
    expect(await screen.findByText(/FCM 접수 완료/)).toBeVisible();
    expect(send.mock.calls.map(([input]) => input)).toEqual([original, original, original]);
    expect(screen.queryByRole("button", { name: "동일 요청 상태 확인" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("알림 제목")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "새 공지 작성" }));
    expect(screen.getByLabelText("알림 제목")).toBeEnabled();
    expect(screen.getByLabelText("알림 제목")).toHaveValue("");
  });
  it.each(["validated", "failed"] as const)(
    "unlocks an uncertain request only after a successful terminal %s response",
    async (status) => {
      const send = vi.fn<AdminApi["send"]>()
        .mockRejectedValueOnce({ code: "functions/deadline-exceeded" })
        .mockRejectedValueOnce({ code: "functions/permission-denied" })
        .mockImplementation(async (input) => ({
          requestId: input.requestId,
          status,
        }));
      await compose(apiMock({ send }));
      await userEvent.click(screen.getByRole("button", { name: "테스트 검증" }));
      await userEvent.click(await screen.findByRole("button", { name: "동일 요청 상태 확인" }));
      expect(screen.getByLabelText("알림 제목")).toBeDisabled();
      await userEvent.click(screen.getByRole("button", { name: "동일 요청 상태 확인" }));
      await waitFor(() => expect(screen.getByLabelText("알림 제목")).toBeEnabled());
      expect(screen.getByLabelText("알림 내용")).toBeEnabled();
      expect(screen.queryByRole("button", { name: "동일 요청 상태 확인" })).not.toBeInTheDocument();
      const original = send.mock.calls[0][0];
      expect(send.mock.calls.map(([input]) => input)).toEqual([original, original, original]);
      expect(screen.getByRole(status === "validated" ? "status" : "alert")).toHaveTextContent(
        status === "validated" ? "테스트 검증 완료" : "발송에 실패했습니다",
      );
    },
  );
  it.each([
    "permission-denied",
    "unauthenticated",
    "invalid-argument",
    "failed-precondition",
    "resource-exhausted",
  ])("unlocks a first-time request definitively rejected with %s", async (code) => {
    await compose(apiMock({
      send: vi.fn(async () => { throw { code: `functions/${code}` }; }),
    }));
    await userEvent.click(screen.getByRole("button", { name: "테스트 검증" }));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByLabelText("알림 제목")).toBeEnabled();
    expect(screen.getByLabelText("알림 내용")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "동일 요청 상태 확인" })).not.toBeInTheDocument();
  });
  it.each(["pending", "unknown"] as const)(
    "does not call %s successful",
    async (status) => {
      const api = await compose(
        apiMock({
          send: vi.fn(async (v) => ({ requestId: v.requestId, status })),
        }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: "테스트 검증" }),
      );
      expect(
        await screen.findByText(/처리 상태를 확인할 수 없습니다/),
      ).toBeVisible();
      expect(screen.queryByText(/FCM 접수 완료/)).not.toBeInTheDocument();
    },
  );
  it("renders notification text safely without HTML execution", async () => {
    render(<App api={apiMock()} />);
    fireEvent.change(await screen.findByLabelText("알림 제목"), {
      target: { value: "<img src=x onerror=alert(1)>" },
    });
    expect(
      screen.getByRole("heading", { name: "<img src=x onerror=alert(1)>" }),
    ).toBeVisible();
    expect(document.querySelector("img")).toBeNull();
  });
  it("clears draft when the auth identity changes", async () => {
    let listener!: (u: Identity | null) => void;
    const api = apiMock({
      subscribe: (cb) => {
        listener = cb;
        cb({ uid: "1", email: "a" });
        return () => {};
      },
    });
    await compose(api);
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("알림 제목")).not.toBeInTheDocument(),
    );
    listener({ uid: "2", email: "b" });
    expect(await screen.findByLabelText("알림 제목")).toHaveValue("");
  });
});
