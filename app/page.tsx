'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// ▼ firebase.ts から auth を読み込む（初期化エラー防止）
import { auth } from '../lib/firebase'; 
import { onAuthStateChanged, User } from 'firebase/auth';

// ▼ 作成した部品をインポート
import CaseList from '../components/CaseList';
import Header from '../components/Header'; 

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // ログイン監視
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push('/login');
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* ▼▼▼ ① ここでヘッダーを表示！ ▼▼▼ */}
      <Header user={user} />

      {/* ▼▼▼ ② ここでリストを表示！ ▼▼▼ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <CaseList />
      </main>

      <footer className="text-center text-gray-400 text-sm py-6">
        &copy; 2026 NPO School Liberty Network
      </footer>
    </div>
  );
}