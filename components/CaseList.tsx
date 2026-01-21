'use client';

import { useState, useEffect } from 'react';
// ▼ 変更: auth もここで読み込む
import { db, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import Link from 'next/link';

type CaseData = {
  id: string;
  name: string;
  summary: string;
  status: string;
  assignedTo?: string[] | string;
  createdAt: Timestamp;
  // ▼ 追加: 型定義に管理番号を含めておくと安全です
  caseNumber?: number | string; 
  [key: string]: any;
};

type StaffMap = { [email: string]: string };

export default function CaseList() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [staffMap, setStaffMap] = useState<StaffMap>({});
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMine, setFilterMine] = useState(false);

  // ▼ 変更: getAuth() ではなく、import した auth を使う
  const currentUser = auth.currentUser;
  const myEmail = currentUser?.email || "";

  useEffect(() => {
    const fetchStaffMap = async () => {
        try {
            const snap = await getDocs(collection(db, 'staff'));
            const map: StaffMap = {};
            snap.forEach(doc => {
                const data = doc.data();
                if(data.email && data.name) {
                    map[data.email] = data.name;
                }
            });
            setStaffMap(map);
        } catch(e) { console.error(e); }
    };
    fetchStaffMap();

    // ▼▼▼ ここを修正しました ▼▼▼
    // 元: orderBy('createdAt', 'desc') -> 日付の新しい順
    // 今: orderBy('caseNumber', 'desc') -> 管理番号の大きい順
    const q = query(collection(db, 'cases'), orderBy('caseNumber', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const casesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        status: doc.data().status || 'new',
      })) as CaseData[];
      setCases(casesData);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredCases = cases.filter((c) => {
    const statusMatch = activeTab === 'all' || c.status === activeTab;
    const assignedList = Array.isArray(c.assignedTo) ? c.assignedTo : (c.assignedTo ? [c.assignedTo] : []);
    const assignedNames = assignedList.map(email => staffMap[email] || email).join(' ');
    const searchLower = searchTerm.toLowerCase();
    const keywordMatch = c.name?.toLowerCase().includes(searchLower) || c.summary?.toLowerCase().includes(searchLower) || assignedNames.toLowerCase().includes(searchLower);
    const mineMatch = filterMine ? assignedList.includes(myEmail) : true;
    return statusMatch && keywordMatch && mineMatch;
  });

  const newCount = cases.filter(c => c.status === 'new').length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* コントロールバー */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="text-gray-500 text-sm">
           現在の未対応案件: <span className="font-bold text-red-500 text-lg">{newCount}</span> 件
        </div>
        
        <div className="flex gap-3 w-full md:w-auto items-center flex-wrap">
          <Link 
            href="/cases/new" 
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded shadow transition whitespace-nowrap flex items-center gap-1"
          >
            <span>+</span> 相談案件登録
          </Link>

          <label className="flex items-center cursor-pointer bg-white px-3 py-2 rounded border hover:bg-gray-50 shadow-sm transition">
              <input 
                  type="checkbox" 
                  className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  checked={filterMine}
                  onChange={(e) => setFilterMine(e.target.checked)}
              />
              <span className="text-sm font-bold text-gray-700 whitespace-nowrap">自分の担当のみ</span>
          </label>

          <input
            type="text"
            placeholder="🔍 名前・内容・担当者..."
            className="w-full md:w-64 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-6 overflow-x-auto">
          {[
            { id: 'all', label: 'すべて', count: cases.length },
            { id: 'new', label: '未対応', count: newCount, color: 'red' },
            { id: 'in_progress', label: '対応中', count: cases.filter(c => c.status === 'in_progress').length, color: 'blue' },
            { id: 'completed', label: '完了', count: cases.filter(c => c.status === 'completed').length, color: 'gray' },
          ].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${activeTab === tab.id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${tab.id === 'new' ? 'bg-red-100 text-red-600' : tab.id === 'in_progress' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{tab.count}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* リスト */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {filteredCases.length === 0 ? (
          <div className="p-10 text-center text-gray-400">該当する案件はありません</div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredCases.map((c) => {
              const assignedList = Array.isArray(c.assignedTo) ? c.assignedTo : (c.assignedTo ? [c.assignedTo] : []);
              
              return (
                <li key={c.id} className="hover:bg-gray-50 transition">
                  <Link href={`/cases/${c.id}`} className="block p-6">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 text-xs font-bold rounded ${c.status === 'new' ? 'bg-red-50 text-red-600 border border-red-200' : c.status === 'in_progress' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                          {c.status === 'new' ? '未対応' : c.status === 'in_progress' ? '対応中' : '完了'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : '日付不明'}
                        </span>
                        
                        {assignedList.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {assignedList.map((email, idx) => (
                                  <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 flex items-center">
                                      👤 {staffMap[email] || email}
                                  </span>
                              ))}
                            </div>
                        )}
                      </div>
                      <span className="text-indigo-600 text-sm font-medium hover:underline">詳細を開く &rarr;</span>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {/* 番号があれば表示する */}
                      {c.caseNumber ? <span className="text-blue-600 mr-2">#{c.caseNumber}</span> : null}
                      {c.name} 様
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-1">{c.summary}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}