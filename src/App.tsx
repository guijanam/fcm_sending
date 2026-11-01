import { useEffect, useRef, useState } from "react";
import type { AdminApi, Identity, Announcement, SendInput } from "./api";
import { validateAnnouncement } from "./validation";

export function errorMessage(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  if (
    code.includes("popup-blocked") ||
    code.includes("cancelled-popup-request")
  )
    return "로그인 팝업이 차단되었습니다. 브라우저에서 팝업을 허용하고 다시 시도해 주세요. 모바일에서는 Chrome 또는 Safari에서 직접 열어 주세요.";
  if (code.includes("popup-closed"))
    return "로그인이 취소되었습니다. 준비되면 다시 로그인해 주세요.";
  if (code.includes("unauthorized-domain"))
    return "이 사이트가 Firebase 승인 도메인에 등록되지 않았습니다. 관리자에게 설정을 요청해 주세요.";
  return "요청을 완료하지 못했습니다. 연결과 서버 설정을 확인해 주세요.";
}
export default function App({ api }: { api?: AdminApi | null }) {
  const [phase, setPhase] = useState<
    "loading" | "out" | "checking" | "allowed" | "denied" | "error"
  >(api ? "loading" : "out");
  const [user, setUser] = useState<Identity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!api) return;
    return api.subscribe(
      (u) => {
        const g = ++generation.current;
        setUser(u);
        setError("");
        if (!u) {
          setPhase("out");
          return;
        }
        setPhase("checking");
        api
          .status()
          .then((s) => {
            if (g === generation.current)
              setPhase(
                s.topic === "documents" && s.projectId === "mydia-29ac2"
                  ? "allowed"
                  : "denied",
              );
          })
          .catch((e) => {
            if (g === generation.current)
              setPhase(
                (e as { code?: string })?.code?.includes("permission-denied")
                  ? "denied"
                  : "error",
              );
          });
      },
      (e) => {
        generation.current++;
        setError(errorMessage(e));
        setPhase("error");
      },
    );
  }, [api]);
  async function account(action: "login" | "logout") {
    if (!api || busy) return;
    setBusy(true);
    setError("");
    if (action === "logout") {
      generation.current++;
      setPhase("out");
      setUser(null);
    }
    try {
      await api[action]();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="./">
          <span className="brand-mark">내</span>
          <span>
            내근무 <span className="brand-divider">/</span>{" "}
            <strong>알림 센터</strong>
          </span>
        </a>
        <span className="private-badge">비공개 · 관리자 전용</span>
        {user && (
          <button
            className="quiet"
            disabled={busy}
            onClick={() => account("logout")}
          >
            로그아웃
          </button>
        )}
      </header>
      <main className="page">
        {!api ? (
          <Setup />
        ) : phase === "allowed" ? (
          <Editor key={user?.uid} api={api} />
        ) : (
          <section className="access-card card">
            <span className="eyebrow">PRIVATE WORKSPACE</span>
            <h1>
              {phase === "denied"
                ? "접근 권한이 없습니다"
                : phase === "out"
                  ? "공지의 시작, 알림 센터"
                  : phase === "error"
                    ? "연결을 확인해 주세요"
                    : "안전하게 연결 중"}
            </h1>
            <p>
              {phase === "denied"
                ? "이 계정은 공지 발송 권한이 없습니다. 승인된 관리자 계정으로 다시 로그인해 주세요."
                : phase === "checking"
                  ? "관리자 권한을 확인하고 있습니다."
                  : phase === "loading"
                    ? "로그인 정보를 확인하고 있습니다."
                    : phase === "error"
                      ? "서버에서 관리자 권한을 확인하지 못했습니다. 다시 로그인하거나 관리자에게 문의해 주세요."
                      : "승인된 Google 계정으로 로그인하고 내근무의 전체 공지를 관리하세요."}
            </p>
            {phase === "out" && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => account("login")}
              >
                Google로 로그인
              </button>
            )}
            {phase === "denied" && !user && (
              <button onClick={() => account("logout")}>로그아웃</button>
            )}
          </section>
        )}
        {error && (
          <p className="notice danger" role="alert">
            {error}
          </p>
        )}
      </main>
      <footer>
        내근무 알림 센터 <span>·</span> 필요한 소식을, 정확하게.
      </footer>
    </>
  );
}
function Setup() {
  return (
    <div className="setup-grid">
      <section className="card setup-card">
        <span className="eyebrow">
          <span className="status-dot" /> 초기 설정 필요
        </span>
        <h1>알림 센터 연결하기</h1>
        <p className="lead">
          소식을 전하기 전에,
          <br />
          안전한 연결부터 준비해 주세요.
        </p>
        <p>
          Firebase 웹 설정이 아직 연결되지 않았습니다. 설정을 완료하면 Google
          로그인과 관리자 권한 확인을 시작합니다.
        </p>
        <ol className="setup-steps">
          <li>
            <strong>Firebase 웹 앱 설정 준비</strong>
            <p>
              mydia-29ac2 프로젝트의 웹 앱에서 apiKey와 appId를 포함한 Firebase
              설정을 복사하세요.
            </p>
          </li>
          <li>
            <strong>배포 환경에 설정 추가</strong>
            <p>
              GitHub 저장소의 Actions 변수 <code>FIREBASE_WEB_CONFIG</code>에
              설정 JSON을 등록하고 배포를 다시 실행하세요. 로컬 개발은{" "}
              <code>public/firebase-config.json</code>을 수정하세요.
            </p>
          </li>
          <li>
            <strong>로그인과 서버 권한 확인</strong>
            <p>
              Google 로그인을 활성화하고 사이트 호스트를 승인 도메인에
              등록하세요. 백엔드 함수를 배포하고 서버의 관리자 허용 목록을
              설정하세요.
            </p>
          </li>
        </ol>
        <div className="notice">
          연결 전에는 로그인, 공지 조회 및 발송을 사용할 수 없습니다. 관리자
          권한은 서버에서만 확인합니다.
        </div>
      </section>
      <aside className="setup-aside">
        <NotificationPreview
          title="필요한 소식이 닿는 순간"
          body="전체 공지를 작성하고, 미리 확인한 뒤 안전하게 발송하세요."
        />
        <div className="aside-copy">
          <span className="eyebrow">ONE MESSAGE, ONE PLACE</span>
          <h2>
            전달은 간결하게.
            <br />
            확인은 신중하게.
          </h2>
          <p>
            전체 공지 전용 채널
            <br />
            발송 전 검토 · 서버 권한 확인
          </p>
        </div>
      </aside>
    </div>
  );
}
export function NotificationPreview({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="preview-card" aria-label="Android 알림 미리보기">
      <div className="preview-top">
        <span>알림 미리보기</span>
        <span>ANDROID</span>
      </div>
      <div className="notification">
        <div className="notification-meta">
          <span className="tiny-mark">내</span> 내근무 <span>· 지금</span>
        </div>
        <h3>{title || "알림 제목을 입력해 주세요"}</h3>
        <p>{body || "작성한 내용이 여기에 표시됩니다."}</p>
      </div>
      <p className="preview-note">
        실제 표시는 기기 및 알림 설정에 따라 다를 수 있습니다.
      </p>
    </section>
  );
}
function Editor({ api }: { api: AdminApi }) {
  const [title, setTitle] = useState(""),
    [body, setBody] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState<SendInput | null>(null),
    [completed, setCompleted] = useState(false);
  const [history, setHistory] = useState<Announcement[] | null>(null),
    [historyError, setHistoryError] = useState("");
  const sending = useRef(false),
    review = useRef<HTMLButtonElement>(null),
    cancel = useRef<HTMLButtonElement>(null),
    dialog = useRef<HTMLDivElement>(null);
  const locked = busy || !!uncertain || completed;
  async function loadHistory() {
    setHistoryError("");
    try {
      const data = await api.list();
      setHistory(data.items);
    } catch {
      setHistoryError("발송 기록을 불러오지 못했습니다.");
    }
  }
  useEffect(() => {
    let active = true;
    api
      .list()
      .then((data) => {
        if (active) setHistory(data.items);
      })
      .catch(() => {
        if (active) setHistoryError("발송 기록을 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [api]);
  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);
  function close() {
    if (sending.current) return;
    setOpen(false);
    setConfirmed(false);
    review.current?.focus();
  }
  function check() {
    const issue = validateAnnouncement(title, body);
    setError(issue || "");
    return !issue;
  }
  function reviewSend() {
    if (locked || !check()) return;
    setConfirmed(false);
    setOpen(true);
  }
  async function send(dryRun: boolean, retry?: SendInput) {
    if (
      sending.current ||
      (!retry && (uncertain || completed)) ||
      (!retry && !check())
    )
      return;
    const input = retry ?? {
      title,
      body,
      dryRun,
      requestId: crypto.randomUUID(),
    };
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setOpen(false);
    setConfirmed(false);
    try {
      const result = await api.send(input);
      if (result.status === "pending" || result.status === "unknown") {
        setUncertain(input);
        setNotice(
          "처리 상태를 확인할 수 없습니다. 중복 발송을 피하려면 새 요청을 만들지 말고 동일 요청의 상태를 확인하세요.",
        );
      } else {
        setUncertain(null);
        if (result.status === "accepted") {
          setCompleted(true);
          setNotice("FCM 접수 완료 · 기기 전달이나 열람을 보장하지 않습니다.");
        } else if (result.status === "validated") {
          setNotice("테스트 검증 완료 · 실제 발송 없음");
        } else {
          setError("발송에 실패했습니다. 서버 기록과 설정을 확인해 주세요.");
        }
        void loadHistory();
      }
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      if (
        !retry &&
        [
          "permission-denied",
          "unauthenticated",
          "invalid-argument",
          "failed-precondition",
          "resource-exhausted",
        ].some((c) => code.includes(c))
      ) {
        setUncertain(null);
        setError(errorMessage(e));
      } else {
        setUncertain(input);
        setNotice(
          "처리 상태를 확인할 수 없습니다. 응답이 끊겨도 발송되었을 수 있습니다. 동일 요청으로만 다시 확인하세요.",
        );
      }
    } finally {
      sending.current = false;
      setBusy(false);
      review.current?.focus();
    }
  }
  const statusLabels: Record<string, string> = {
    accepted: "FCM 접수",
    validated: "검증 완료",
    pending: "처리 중 · 확인 필요",
    unknown: "상태 불명",
    failed: "실패",
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NOTIFICATION WORKSPACE</span>
          <h1>공지 보내기</h1>
          <p>꼭 필요한 소식을, 모두에게 한 번에.</p>
        </div>
        <span className="channel-badge">
          <span className="status-dot" /> 전체 공지 채널
        </span>
      </div>
      <div className="editor-grid">
        <section className="card composer">
          <div className="section-heading">
            <h2>새 알림 작성</h2>
            <span>01 / COMPOSE</span>
          </div>
          <div className="target">
            <span className="target-symbol" aria-hidden="true">
              ↗
            </span>
            <div>
              <strong>전체 공지</strong>
              <p>documents 토픽 구독 기기</p>
            </div>
            <span className="fixed-badge">고정 대상</span>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reviewSend();
            }}
          >
            <div className="field">
              <div className="label-row">
                <label htmlFor="title">알림 제목</label>
                <span id="title-count">{[...title].length} / 80</span>
              </div>
              <input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={locked}
                placeholder="한눈에 알아볼 수 있는 제목"
                aria-describedby="title-count"
              />
            </div>
            <div className="field">
              <div className="label-row">
                <label htmlFor="body">알림 내용</label>
                <span id="body-count">{[...body].length} / 1,000</span>
              </div>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={locked}
                placeholder="전달할 소식을 간결하게 작성해 주세요."
                rows={7}
                aria-describedby="body-count"
              />
            </div>
            <p className="field-hint">
              개인정보나 민감한 정보는 포함하지 마세요.
            </p>
            {error && (
              <p role="alert" className="notice danger">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="notice">
                {notice}
              </p>
            )}
            {uncertain && (
              <div className="retry-area">
                <code>요청 ID: {uncertain.requestId}</code>
                <p>
                  동일 내용 · 동일 ID로 서버에 다시 요청합니다. 새 발송 요청은
                  생성하지 않습니다.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => send(uncertain.dryRun, uncertain)}
                >
                  동일 요청 상태 확인
                </button>
              </div>
            )}
            {completed && (
              <button
                type="button"
                onClick={() => {
                  setCompleted(false);
                  setTitle("");
                  setBody("");
                  setNotice("");
                }}
              >
                새 공지 작성
              </button>
            )}
            <div className="form-actions">
              <div>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => send(true)}
                >
                  테스트 검증
                </button>
                <small>실제 발송 없음</small>
              </div>
              <button
                className="primary"
                type="submit"
                disabled={locked}
                ref={review}
              >
                {busy ? "처리 중…" : "발송 전 검토"}{" "}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </section>
        <aside>
          <NotificationPreview title={title} body={body} />
          <section className="sending-guide">
            <span className="eyebrow">BEFORE YOU SEND</span>
            <h2>보내기 전, 한 번 더.</h2>
            <ul>
              <li>전체 공지 대상과 내용을 확인해 주세요.</li>
              <li>테스트 검증은 기기로 전송되지 않습니다.</li>
              <li>FCM 접수는 실제 전달 완료가 아닙니다.</li>
            </ul>
          </section>
        </aside>
      </div>
      <section className="card history">
        <div className="section-heading">
          <div>
            <h2>발송 기록</h2>
            <p>서버에 기록된 최근 공지</p>
          </div>
          <button className="quiet" onClick={() => loadHistory()}>
            새로고침
          </button>
        </div>
        {historyError ? (
          <p role="alert" className="notice danger">
            {historyError}
          </p>
        ) : history === null ? (
          <p className="empty">발송 기록을 불러오고 있습니다.</p>
        ) : history.length === 0 ? (
          <div className="empty">
            <span aria-hidden="true">↗</span>
            <p>아직 발송 기록이 없습니다.</p>
            <small>공지 발송과 테스트 검증 기록이 여기에 표시됩니다.</small>
          </div>
        ) : (
          <ul className="history-list">
            {history.map((item) => (
              <li key={item.requestId}>
                <div>
                  <span className="history-status">
                    {statusLabels[item.status] || "상태 확인 필요"}
                  </span>
                  <span className="history-mode">
                    {item.mode === "dry-run"
                      ? "테스트 · 실제 발송 없음"
                      : "전체 공지"}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
                <div className="history-details">
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("ko-KR")}
                  </time>
                  <code>{item.requestId}</code>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {open && (
        <div className="modal-backdrop">
          <div
            ref={dialog}
            className="modal card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            aria-describedby="dialog-warning"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              if (e.key === "Tab") {
                const nodes = dialog.current?.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled)",
                );
                if (!nodes?.length) return;
                const first = nodes[0],
                  last = nodes[nodes.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <span className="eyebrow">FINAL CHECK</span>
            <h2 id="dialog-title">전체 공지를 발송할까요?</h2>
            <p id="dialog-warning" className="notice">
              documents 토픽을 구독한 모든 기기에 전송합니다. 발송 후에는
              취소하거나 회수할 수 없습니다.
            </p>
            <div className="review-content">
              <strong>{title}</strong>
              <p>{body}</p>
            </div>
            <label className="confirm-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              전체 대상과 내용을 확인했으며, 되돌릴 수 없는 발송에 동의합니다.
            </label>
            <div className="dialog-actions">
              <button type="button" ref={cancel} onClick={close}>
                취소
              </button>
              <button
                type="button"
                className="primary"
                disabled={!confirmed || busy}
                onClick={() => send(false)}
              >
                전체 공지 발송
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
