'use client';

import { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const provider = new GoogleAuthProvider();

  // もしすでにログイン済みなら、自動でダッシュボードに戻す
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push('/'); 
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleLogin = async () => {
    try {
      //ログイン試行
      const result =await signInWithPopup(auth, provider);
      const user =result.user;

      //ドメインチェック
      const ALLOWED_DOMAIN="@n-sln.org";

      if(!user.email?.endsWith(ALLOWED_DOMAIN)){
        //ダメならログアウトして追い返す
        await auth.signOut();
        alert("申し訳ありません。このシステムは関係者専用です。")
        return;
      }

      //ログイン成功したら
      alert("ログインしました。");
      router.push("/");

    } catch (err: any) {
      console.error(err);
      setError('ログインに失敗しました。もう一度お試しください。');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
        {/* ロゴやタイトル */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">SLN 相談管理システム</h1>
          <p className="text-gray-500 mt-2">関係者専用ログイン</p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {/* Googleログインボタン */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-4 rounded transition shadow-sm"
        >
          {/* GoogleのGアイコン（SVG） */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Googleアカウントでログイン
        </button>
        
        <p className="mt-8 text-xs text-gray-400">
          ※ 権限を持つアカウントのみアクセス可能です
        </p>
      </div>
    </div>
  );
}