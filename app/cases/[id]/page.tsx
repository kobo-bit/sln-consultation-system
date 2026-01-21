'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth, storage } from '../../../lib/firebase'; // ★storage追加
import { 
    doc, getDoc, collection, addDoc, query, orderBy, onSnapshot, 
    serverTimestamp, updateDoc, Timestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
// ★追加: Storage関連
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

type CaseData = {
  id: string;
  caseNumber?: number; // 通し番号
  name: string;
  consulteeType: string;
  relationship?: string;
  prefecture?: string;
  schoolType?: string;
  schoolStage?: string;
  grade?: string;
  schoolName?: string; // 学校名
  summary: string;
  detail: string;
  status: string;
  createdAt: any;
  assignedTo?: string[];
  documentUrl?: string; // Google Doc URL
};

type RecordData = {
  id: string;
  content: string;
  createdAt: any;
  createdBy: string;
  // ★追加: 添付ファイル情報
  attachmentUrl?: string;
  attachmentName?: string;
};

// スタッフリスト（簡易実装）
const staffList = [
    { email: "obo@n-sln.org", name: "大保 海翔" },
    { email: "nishimura@n-sln.org", name: "西村 静恵" },
];

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  // Next.js 15対応: paramsをunwrap
  const { id } = use(params);
  
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [records, setRecords] = useState<RecordData[]>([]);
  const [newRecord, setNewRecord] = useState("");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // ★追加: ファイル選択用State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login');
      } else {
        setCurrentUser(user);
      }
    });

    const fetchCase = async () => {
      const docRef = doc(db, "cases", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCaseData({ id: docSnap.id, ...docSnap.data() } as CaseData);
      } else {
        alert("案件が見つかりません");
        router.push('/dashboard');
      }
      setLoading(false);
    };

    fetchCase();

    // タイムラインのリアルタイム取得
    const q = query(collection(db, "cases", id, "records"), orderBy("createdAt", "desc"));
    const unsubscribeRecords = onSnapshot(q, (snapshot) => {
      const recs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecordData));
      setRecords(recs);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeRecords();
    };
  }, [id, router]);

  // ▼▼▼ 投稿機能（ファイルアップロード対応） ▼▼▼
  const handleAddRecord = async () => {
    // 文字もファイルもない場合は何もしない
    if (!newRecord.trim() && !selectedFile) return; 
    
    setIsSending(true);
    try {
      const s = staffList.find(s => s.email === currentUser?.email);
      const userName = s ? s.name : (currentUser?.email || "担当者");

      let downloadUrl = "";
      let fileName = "";

      // 1. ファイルがある場合はStorageにアップロード
      if (selectedFile) {
        fileName = selectedFile.name;
        // 保存パス: case_files/{案件ID}/{タイムスタンプ}_{ファイル名}
        const storageRef = ref(storage, `case_files/${id}/${Date.now()}_${fileName}`);
        
        await uploadBytes(storageRef, selectedFile);
        downloadUrl = await getDownloadURL(storageRef);
      }

      // 2. Firestoreに保存
      await addDoc(collection(db, "cases", id, "records"), { 
        content: newRecord, 
        createdAt: serverTimestamp(), 
        createdBy: userName,
        // ファイル情報を保存
        attachmentUrl: downloadUrl || null,
        attachmentName: fileName || null
      });

      // 3. フォームのリセット
      setNewRecord("");
      setSelectedFile(null);
      // input要素もクリア
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if(fileInput) fileInput.value = '';

    } catch (e) { 
      console.error(e);
      alert("送信に失敗しました"); 
    } finally { 
      setIsSending(false); 
    }
  };

  // AIアドバイザー機能
  const handleAiAsk = async () => {
    setIsAiLoading(true);
    try {
        const res = await fetch('/api/ai', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                prompt: `
                以下の相談内容について、アドバイスをください。
                【相談概要】${caseData?.summary}
                【詳細】${caseData?.detail}
                【過去の対応履歴】
                ${records.map(r => `・${r.content}${r.attachmentName ? ` (添付: ${r.attachmentName})` : ''}`).join('\n')}
                `
            })
        });
        const data = await res.json();
        
        // AIの回答をタイムラインに追加
        await addDoc(collection(db, "cases", id, "records"), { 
            content: `🤖 [AIアドバイザー]\n${data.answer}`, 
            createdAt: serverTimestamp(), 
            createdBy: "AI System"
        });

    } catch (e) {
        console.error(e);
        alert('AIへの問い合わせに失敗しました');
    } finally {
        setIsAiLoading(false);
    }
  };

  // ステータス更新
  const handleStatusChange = async (newStatus: string) => {
    if (!caseData) return;
    try {
        await updateDoc(doc(db, "cases", id), { status: newStatus });
        setCaseData({ ...caseData, status: newStatus });
    } catch (e) {
        console.error(e);
        alert("ステータス更新に失敗しました");
    }
  };

  // Google Doc作成
  const handleCreateDoc = async () => {
    if(!confirm("Googleドキュメントを作成しますか？")) return;
    try {
        await fetch('/api/doc', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ caseId: id })
        });
        alert("作成を開始しました。しばらくするとドライブに保存されます。");
    } catch (e) {
        console.error(e);
        alert("作成に失敗しました");
    }
  };

  if (loading) return <div className="p-10 text-center">読み込み中...</div>;
  if (!caseData) return <div className="p-10 text-center">データなし</div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ヘッダーエリア */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
            <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-800 flex items-center gap-1 font-bold">
                ← 一覧に戻る
            </button>
            <div className="flex gap-3">
                <select 
                    value={caseData.status} 
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`border rounded px-3 py-1 font-bold ${
                        caseData.status === 'new' ? 'bg-red-50 text-red-600 border-red-200' :
                        caseData.status === 'in_progress' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                        'bg-gray-50 text-gray-600 border-gray-200'
                    }`}
                >
                    <option value="new">未対応</option>
                    <option value="in_progress">対応中</option>
                    <option value="completed">完了</option>
                </select>
                <button onClick={handleCreateDoc} className="bg-white border border-gray-300 text-gray-700 px-4 py-1 rounded hover:bg-gray-50 text-sm font-bold">
                    📄 記録票作成
                </button>
            </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* 左カラム: 相談詳細情報 */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                <div className="mb-6 border-b pb-4">
                    {/* ★通し番号表示 */}
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 mb-2">
                        {caseData.caseNumber && (
                            <span className="text-indigo-600 font-mono text-xl bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                #{String(caseData.caseNumber).padStart(4, '0')}
                            </span>
                        )}
                        <span>{caseData.name} 様</span>
                    </h1>
                    
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mt-2">
                        <span className="bg-gray-100 px-2 py-1 rounded">
                            {caseData.consulteeType === 'student' ? '生徒本人' : '大人'}
                        </span>
                        {caseData.schoolStage && (
                            <span className="bg-gray-100 px-2 py-1 rounded">
                                {caseData.schoolStage === 'high' ? '高校' : caseData.schoolStage}
                                {caseData.grade ? ` ${caseData.grade}年` : ''}
                            </span>
                        )}
                        {caseData.prefecture && (
                            <span className="bg-gray-100 px-2 py-1 rounded">📍 {caseData.prefecture}</span>
                        )}
                         {caseData.schoolName && (
                            <span className="bg-gray-100 px-2 py-1 rounded">🏫 {caseData.schoolName}</span>
                        )}
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">相談概要</h3>
                        <p className="text-lg font-bold text-gray-800">{caseData.summary}</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">詳細内容</h3>
                        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 whitespace-pre-wrap leading-relaxed border border-gray-100">
                            {caseData.detail}
                        </div>
                    </div>
                    {caseData.documentUrl && (
                        <div className="pt-4">
                            <a href={caseData.documentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-2 font-bold">
                                📂 Googleドキュメントを開く
                            </a>
                        </div>
                    )}
                </div>
            </div>

            {/* タイムライン・対応履歴 */}
            <div className="bg-white rounded-lg shadow border-t-4 border-green-500 overflow-hidden mt-6">
                <div className="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-green-900 flex items-center gap-2">📝 相談記録・対応履歴</h2>
                    <span className="text-xs text-green-700 bg-white px-2 py-1 rounded border border-green-200">スタッフ共有用</span>
                </div>
                
                {/* 投稿フォーム */}
                <div className="p-6 border-b bg-gray-50">
                    <div className="flex flex-col gap-2">
                         <textarea 
                            className="w-full border border-gray-300 rounded p-3 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-transparent transition" 
                            rows={3}
                            placeholder="対応内容や連絡事項を入力してください..." 
                            value={newRecord} 
                            onChange={(e) => setNewRecord(e.target.value)}
                        />

                        {/* ★追加: ファイル選択プレビュー */}
                        {selectedFile && (
                          <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-800 px-3 py-1 rounded border border-blue-200 self-start">
                            <span>📎 {selectedFile.name}</span>
                            <button 
                              onClick={() => {
                                setSelectedFile(null);
                                const fileInput = document.getElementById('file-upload') as HTMLInputElement;
                                if(fileInput) fileInput.value = '';
                              }}
                              className="text-blue-400 hover:text-blue-600 font-bold ml-2"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center mt-3">
                        {/* ★追加: ファイル添付ボタン */}
                        <div className="flex items-center">
                          <label htmlFor="file-upload" className="cursor-pointer flex items-center gap-1 text-gray-500 hover:text-green-600 transition px-2 py-1 rounded hover:bg-gray-100">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            <span className="text-sm font-bold">ファイルを添付</span>
                          </label>
                          <input 
                            id="file-upload" 
                            type="file" 
                            className="hidden" 
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setSelectedFile(e.target.files[0]);
                              }
                            }}
                          />
                        </div>

                        <button 
                            onClick={handleAddRecord} 
                            disabled={isSending || (!newRecord.trim() && !selectedFile)} 
                            className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
                        >
                            {isSending ? '送信中...' : '記録を追加'}
                        </button>
                    </div>
                </div>

                {/* 記録リスト */}
                <div className="p-6 bg-white max-h-[600px] overflow-y-auto space-y-6">
                    {records.length === 0 ? (
                        <div className="text-center text-gray-400 py-4">まだ記録はありません</div>
                    ) : (
                        records.map((rec) => (
                            <div key={rec.id} className="border-b last:border-0 pb-4 last:pb-0 group">
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`font-bold text-sm ${rec.createdBy === 'AI System' ? 'text-purple-600' : 'text-gray-800'}`}>
                                        {rec.createdBy || '担当者'}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                        {rec.createdAt?.toDate ? rec.createdAt.toDate().toLocaleString() : '---'}
                                    </span>
                                </div>
                                <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                                    {rec.content}
                                </p>
                                
                                {/* ★追加: 添付ファイルリンク */}
                                {rec.attachmentUrl && (
                                  <div className="mt-2">
                                    <a 
                                      href={rec.attachmentUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded hover:bg-blue-100 transition border border-blue-200"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                      <span className="font-bold underline">{rec.attachmentName || '添付ファイル'}</span>
                                    </a>
                                  </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* 右カラム: 管理情報 & AI */}
        <div className="space-y-6">
            <div className="bg-gradient-to-br from-purple-50 to-white p-6 rounded-xl shadow-sm border border-purple-100">
                <h3 className="text-purple-900 font-bold mb-3 flex items-center gap-2">
                    🤖 AIアドバイザー
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                    相談内容やこれまでの履歴を分析し、対応方針のアドバイスを提示します。
                </p>
                <button 
                    onClick={handleAiAsk}
                    disabled={isAiLoading}
                    className="w-full bg-purple-600 text-white font-bold py-2 rounded shadow hover:bg-purple-700 disabled:opacity-50 transition"
                >
                    {isAiLoading ? 'AIが考え中...' : 'アドバイスをもらう'}
                </button>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-gray-500 font-bold text-xs uppercase tracking-wider mb-4">案件情報</h3>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-gray-400 mb-1">受付日</dt>
                        <dd className="font-bold text-gray-800">
                            {caseData.createdAt?.toDate ? caseData.createdAt.toDate().toLocaleDateString() : '---'}
                        </dd>
                    </div>
                    {/* ★インポートで追加した学校情報を表示 */}
                    {caseData.schoolName && (
                        <div>
                            <dt className="text-gray-400 mb-1">学校名</dt>
                            <dd className="font-bold text-gray-800">{caseData.schoolName}</dd>
                        </div>
                    )}
                    {caseData.assignedTo && caseData.assignedTo.length > 0 && (
                        <div>
                            <dt className="text-gray-400 mb-1">担当者</dt>
                            <dd className="font-bold text-gray-800">
                                {caseData.assignedTo.join(', ')}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>
        </div>
      </div>
    </div>
  );
}