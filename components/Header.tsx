'use client';

import { useRouter } from 'next/navigation';
import { getAuth, signOut, User } from 'firebase/auth';
import Link from 'next/link';

type HeaderProps = {
  user: User | null; // 親ページからログインユーザー情報を受け取る
};

export default function Header({ user }: HeaderProps) {
  const router = useRouter();
  const auth = getAuth();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  return (
    <header className="bg-white shadow-sm mb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          {/* ロゴエリア */}
          <Link href="/" className="flex items-center gap-2 group hover:opacity-80 transition">
             <span className="bg-blue-600 text-white px-2 py-1 rounded text-sm font-bold">SLN</span>
             <span className="font-bold text-gray-800 text-lg">相談案件管理システム</span>
          </Link>
          
          {/* 右側のユーザー情報エリア */}
          {user && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 hidden sm:block">
                {user.email}
              </span>
              <button 
                onClick={handleLogout}
                className="text-xs font-bold text-red-500 border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition"
              >
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}