export type Identity = { uid: string; email: string | null };
export type Announcement = {
  requestId: string;
  title: string;
  body: string;
  status: "accepted" | "validated" | "pending" | "failed" | "unknown";
  createdAt: string;
  mode: "live" | "dry-run";
  messageId?: string;
};
export type SendInput = {
  title: string;
  body: string;
  requestId: string;
  dryRun: boolean;
};
export type SendResult = {
  requestId: string;
  status: Announcement["status"];
  messageId?: string;
  duplicate?: boolean;
};
export interface AdminApi {
  readonly backendReady?: boolean;
  subscribe(
    listener: (user: Identity | null) => void,
    error: (error: unknown) => void,
  ): () => void;
  login(): Promise<void>;
  logout(): Promise<void>;
  status(): Promise<{ topic: string; projectId: string; email: string }>;
  send(input: SendInput): Promise<SendResult>;
  list(): Promise<{ items: Announcement[] }>;
}
