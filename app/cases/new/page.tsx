'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import NewCaseForm from '../../../components/NewCaseForm';
import Header from '../../../components/Header'; // ★追加

export default function NewCasePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/login');
      else { setUser(currentUser); setLoading(false); }
    });
    return () => unsubscribe();
  }, [auth, router]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ▼▼▼ 共通ヘッダー ▼▼▼ */}
      <Header user={user} />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <button 
          onClick={() => router.back()} 
          className="mb-4 text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1 font-bold"
        >
          ← 一覧に戻る
        </button>

        <div className="bg-white p-8 rounded shadow-lg">
           <NewCaseForm />
        </div>
      </div>
    </div>
  );
}