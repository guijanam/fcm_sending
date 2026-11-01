import { initializeApp } from "firebase/app";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { AdminApi, Announcement, SendInput, SendResult } from "./api";
export async function loadApi(): Promise<AdminApi | null> {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}firebase-config.json`,
      { cache: "no-store" },
    );
    if (!response.ok) return null;
    const config = await response.json();
    if (
      !config ||
      !["apiKey", "appId", "authDomain", "messagingSenderId"].every(
        (k) => typeof config[k] === "string" && config[k].trim(),
      ) ||
      config.projectId !== "mydia-29ac2"
    )
      return null;
    const app = initializeApp(config),
      auth = getAuth(app),
      functions = getFunctions(
        app,
        config.functionsRegion || "asia-northeast3",
      );
    await setPersistence(auth, browserLocalPersistence);
    return {
      backendReady: config.backendReady !== false,
      subscribe: (listener, error) =>
        onAuthStateChanged(
          auth,
          (user) =>
            listener(user ? { uid: user.uid, email: user.email } : null),
          error,
        ),
      login: async () => {
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      logout: () => signOut(auth),
      status: async () =>
        (
          await httpsCallable<
            Record<string, never>,
            { topic: string; projectId: string; email: string }
          >(
            functions,
            "fcmAdminStatus",
          )({})
        ).data,
      send: async (input: SendInput) =>
        (
          await httpsCallable<SendInput, SendResult>(
            functions,
            "fcmSendAnnouncement",
          )(input)
        ).data,
      list: async () =>
        (
          await httpsCallable<Record<string, never>, { items: Announcement[] }>(
            functions,
            "fcmListAnnouncements",
          )({})
        ).data,
    };
  } catch {
    return null;
  }
}
