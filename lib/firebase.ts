import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // 認証機能は後で使います

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// アプリの初期化（二重初期化を防ぐおまじない）
// 「まだ初期化されてなかったら初期化する、されてたら既存のものを使う」というロジックです
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// データベース機能を使えるようにしてエクスポート
export const db = getFirestore(app);
export const auth = getAuth(app); // 後で有効化

