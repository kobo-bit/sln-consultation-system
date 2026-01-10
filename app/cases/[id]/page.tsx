'use client';
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

import { useEffect, useState, use } from 'react';
import { db, auth } from '../../../lib/firebase';
import { 
  doc, getDoc, updateDoc, Timestamp, 
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs, where, limit 
} from 'firebase/firestore';
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from 'next/navigation';
import Header from '../../../components/Header';

type Staff = {
  id: string;
  name: string;
  email: string;
};

type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export default function CaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const [user, setUser] = useState<any>(null);
  const [caseData, setCaseData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [pastCases, setPastCases] = useState<any[]>([]);

  // AI関連
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);

  // 編集関連
  const [scheduleMode, setScheduleMode] = useState(false);
  const [editData, setEditData] = useState({
    meetingStatus: 'untouched', meetingType: 'online', meetingDate: '', locationOrUrl: '', attendeeEmails: ''
  });
  const [records, setRecords] = useState<any[]>([]);
  const [newRecord, setNewRecord] = useState(''); // ← もし未定義エラーが出る場合はこれを追加
  const [isSending, setIsSending] = useState(false); // ← これも

  const router = useRouter();
  const { id } = use(params);
  const currentUser = auth.currentUser;

  // ▼▼▼ 追加: 基本情報編集用のState ▼▼▼
  const [isEditing, setIsEditing] = useState(false);
  const [basicFormData, setBasicFormData] = useState({
    name: '', consulteeType: 'student', schoolType: 'public', 
    schoolStage: 'high', prefecture: '', summary: '', detail: ''
  });

  // 🔐 門番機能
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) router.push('/login');
      else setUser(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!id) return;

    // 1. スタッフ取得
    const fetchStaff = async () => {
      try {
        const snap = await getDocs(collection(db, 'staff'));
        setStaffList(snap.docs.map(d => ({ id: d.id, name: d.data().name, email: d.data().email } as Staff)));
      } catch (e) { console.error(e); }
    };
    fetchStaff();

    // 2. 案件詳細取得
    const fetchCase = async () => {
      const d = await getDoc(doc(db, 'cases', id));
      if (d.exists()) {
        const data = d.data();
        setCaseData({ id: d.id, ...data });
        setBasicFormData({
          name: data.name || '',
          consulteeType: data.consulteeType || 'student',
          schoolType: data.schoolType || 'public',
          schoolStage: data.schoolStage || 'high',
          prefecture: data.prefecture || '',
          summary: data.summary || '',
          detail: data.detail || ''
        });
        setEditData({
            meetingStatus: data.meetingStatus || 'untouched',
            meetingType: data.meetingType || 'online',
            meetingDate: data.meetingDate ? formatDateForInput(data.meetingDate) : '',
            locationOrUrl: data.locationOrUrl || '',
            attendeeEmails: data.attendeeEmails || ''
        });
      } else { alert('案件なし'); router.push('/dashboard'); }
      setLoading(false);
    };
    fetchCase();

    // 3. 過去事例取得
    const fetchPast = async () => {
        try {
            const q = query(collection(db, 'cases'), where('status', '==', 'completed'), orderBy('createdAt', 'desc'), limit(20));
            const snap = await getDocs(q);
            setPastCases(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c:any) => c.id !== id));
        } catch (e) { console.error(e); }
    };
    fetchPast();

    // 4. 履歴監視 (人間が書いた記録)
    const unsubRecords = onSnapshot(query(collection(db, "cases", id, "records"), orderBy("createdAt", "desc")), (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // ▼▼▼ 5. AIチャット履歴の監視 (ここを追加) ▼▼▼
    // createdAtの昇順（古い順）に並べて、会話の流れを再現します
    const unsubAi = onSnapshot(query(collection(db, "cases", id, "aiChats"), orderBy("createdAt", "asc")), (snap) => {
      const msgs = snap.docs.map(d => ({ 
        role: d.data().role, 
        text: d.data().text 
      })) as ChatMessage[];
      setAiMessages(msgs);
    });

    return () => {
      unsubRecords();
      unsubAi(); // 終了時に監視解除
    };
  }, [id, router]);

  const formatDateForInput = (timestamp: any) => {
    if (!timestamp?.toDate) return '';
    const d = timestamp.toDate();
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // ▼▼▼ AI送信処理 (DB保存対応) ▼▼▼
  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    
    const userMessage = aiInput;
    setAiInput('');
    setIsAiThinking(true);

    try {
      // 1. まずユーザーの質問をDBに保存 (画面にはonSnapshot経由で反映されます)
      await addDoc(collection(db, 'cases', id, 'aiChats'), {
        role: 'user',
        text: userMessage,
        createdAt: serverTimestamp()
      });

      // --- ドキュメント取得などの準備 ---
      let docContent = "（ドキュメントはありません）";
      if (caseData.documentUrl?.includes('docs.google.com')) {
          try {
              const res = await fetch('/api/doc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ documentUrl: caseData.documentUrl }),
              });
              const json = await res.json();
              if (json.text) docContent = json.text;
          } catch (e) { console.error("Doc fetch failed", e); }
      }

      const pastCasesText = pastCases.length > 0 ? pastCases.map(c => `・[事例] ${c.summary}`).join('\n') : "（過去事例なし）";
      const contextPrompt = `
      あなたはNPO法人School Liberty Networkの相談アシスタントです。
      【現在の案件】相談者:${caseData.name}, 概要:${caseData.summary}, 詳細:${caseData.detail}
      【ドキュメント】${docContent.slice(0, 10000)}
      【過去履歴】${records.map(r => `・${r.content}`).join('\n')}
      【過去事例】${pastCasesText}
      【質問】${userMessage}
      以上の内容をもとに、相談員(入力者)はどのように相談者に接していけばいいかを教えてください。`;

      // --- AIへ送信 ---
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: contextPrompt }),
      });
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.details || "API Error");

      // 2. AIの回答をDBに保存 (これもonSnapshot経由で画面に出ます)
      await addDoc(collection(db, 'cases', id, 'aiChats'), {
        role: 'model',
        text: json.text,
        createdAt: serverTimestamp()
      });

    } catch (error) {
      console.error(error);
      // エラー時は画面にだけ出す（保存はしない）
      setAiMessages(prev => [...prev, { role: 'model', text: "エラーが発生しました。" }]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
        const u: any = { ...editData, meetingDate: editData.meetingDate ? Timestamp.fromDate(new Date(editData.meetingDate)) : null };
        await updateDoc(doc(db, 'cases', id), u);
        setCaseData({ ...caseData, ...u }); setScheduleMode(false); alert('保存しました');
    } catch { alert('失敗しました'); }
  };
  
  // ▼▼▼ 追加: 基本情報の保存処理 ▼▼▼
  const handleSaveBasicInfo = async () => {
    try {
        await updateDoc(doc(db, 'cases', id), basicFormData);
        // 画面の表示データも更新
        setCaseData({ ...caseData, ...basicFormData });
        setIsEditing(false);
        alert('基本情報を更新しました');
    } catch (e) {
        console.error(e);
        alert('更新に失敗しました');
    }
  }
  
  // 記録追加用の関数 (もし以前のコードで消えていたら復活させてください)
  const handleAddRecord = async () => {
    if (!newRecord.trim()) return; setIsSending(true);
    try {
      const s = staffList.find(s => s.email === currentUser?.email);
      await addDoc(collection(db, "cases", id, "records"), { content: newRecord, createdAt: serverTimestamp(), createdBy: s ? s.name : (currentUser?.email || "担当者") });
      setNewRecord("");
    } catch { alert("失敗しました"); } finally { setIsSending(false); }
  };

  const handleStatusChange = async (st: string) => {
    if(!caseData) return; await updateDoc(doc(db, 'cases', id), { status: st }); setCaseData({ ...caseData, status: st });
  };
  const toggleStaff = async (email: string) => {
    let list = Array.isArray(caseData.assignedTo) ? [...caseData.assignedTo] : (caseData.assignedTo ? [caseData.assignedTo] : []);
    list = list.includes(email) ? list.filter(e => e !== email) : [...list, email];
    await updateDoc(doc(db, 'cases', id), { assignedTo: list }); setCaseData({ ...caseData, assignedTo: list });
  };
  const assignToMe = () => { if(currentUser?.email && !((caseData.assignedTo || []).includes(currentUser.email))) toggleStaff(currentUser.email); };

  if (loading) return <div className="p-10 text-center">読み込み中...</div>;
  if (!caseData) return <div className="p-10 text-center">データがありません</div>;
  const assignedList = Array.isArray(caseData.assignedTo) ? caseData.assignedTo : (caseData.assignedTo ? [caseData.assignedTo] : []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header user={user} />

      <div className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* === 左カラム: 案件詳細 === */}
        <div className="lg:col-span-2 space-y-6 pb-12">
            <div className="bg-white rounded-lg shadow p-6 flex justify-between items-center">
                <div><h1 className="text-2xl font-bold text-gray-800">{caseData.name} 様</h1><p className="text-sm text-gray-500">受付日: {caseData.createdAt?.toDate ? caseData.createdAt.toDate().toLocaleDateString() : '---'}</p></div>
                <div className="flex gap-3">
                    {caseData.documentUrl && (<a href={caseData.documentUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-100 text-blue-700 px-4 py-2 rounded font-bold hover:bg-blue-200 transition">📄 相談記録を開く</a>)}
                    <button onClick={() => router.back()} className="bg-gray-100 text-gray-600 px-4 py-2 rounded hover:bg-gray-200 transition">一覧に戻る</button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow border-t-4 border-indigo-500 overflow-hidden">
                <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center"><h2 className="text-lg font-bold text-indigo-900 flex items-center gap-2">📅 面談スケジュール管理</h2>{!scheduleMode && (<button onClick={() => setScheduleMode(true)} className="bg-indigo-600 text-white px-4 py-1.5 rounded text-sm hover:bg-indigo-700 transition shadow-sm">編集する</button>)}</div>
                <div className="p-6">
                    {scheduleMode ? (
                        <div className="space-y-6 animate-fadeIn">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div><label className="block text-sm font-bold text-gray-700 mb-2">調整状況</label><select className="w-full border rounded p-2" value={editData.meetingStatus} onChange={(e) => setEditData({...editData, meetingStatus: e.target.value})}><option value="untouched">未定</option><option value="adjusting">日程調整中</option><option value="confirmed">確定</option><option value="done">面談完了</option></select></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-2">面談日時</label><input type="datetime-local" className="w-full border rounded p-2" value={editData.meetingDate} onChange={(e) => setEditData({...editData, meetingDate: e.target.value})} /></div>
                                <div className="md:col-span-2"><label className="block text-sm font-bold text-gray-700 mb-2">同席者・招待者</label><input type="text" className="w-full border rounded p-2 bg-gray-50" value={editData.attendeeEmails} onChange={(e) => setEditData({...editData, attendeeEmails: e.target.value})} /></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-2">面談形式</label><div className="flex gap-4 mt-2"><label className="flex items-center"><input type="radio" name="mType" value="online" checked={editData.meetingType === 'online'} onChange={() => setEditData({...editData, meetingType: 'online'})} className="mr-2" /> オンライン</label><label className="flex items-center"><input type="radio" name="mType" value="offline" checked={editData.meetingType === 'offline'} onChange={() => setEditData({...editData, meetingType: 'offline'})} className="mr-2" /> 対面</label></div></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-2">{editData.meetingType === 'online' ? '接続先URL' : '実施場所'}</label><input type="text" className="w-full border rounded p-2 bg-gray-50" value={editData.locationOrUrl} onChange={(e) => setEditData({...editData, locationOrUrl: e.target.value})} /></div>
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t"><button onClick={() => setScheduleMode(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">キャンセル</button><button onClick={handleSaveSchedule} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 shadow">保存する</button></div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div><div className="mb-4"><span className={`px-3 py-1 rounded-full text-sm font-bold ${caseData.meetingStatus === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{caseData.meetingStatus === 'confirmed' ? '日程確定' : '未定/調整中'}</span></div><div className="text-3xl font-bold text-gray-800 mb-1">{caseData.meetingDate?.toDate ? caseData.meetingDate.toDate().toLocaleString('ja-JP') : '日時未設定'}</div></div>
                            <div className="bg-gray-50 p-4 rounded border"><h3 className="text-xs font-bold text-gray-400 uppercase mb-2">{caseData.meetingType === 'offline' ? 'ACCESS INFO' : 'MEETING URL'}</h3><p className="text-lg text-gray-800 font-medium break-all">{caseData.locationOrUrl || '未入力'}</p></div>
                        </div>
                    )}
                </div>
            </div>

            
            {/* 詳細情報カード */}
            <div className="bg-white rounded-lg shadow p-8">
                <div className="flex justify-between items-center border-b pb-2 mb-6">
                    <h2 className="text-lg font-bold text-gray-800">詳細情報</h2>
                    {/* ▼▼▼ 追加: 編集ボタン ▼▼▼ */}
                    {!isEditing && (
                        <button onClick={() => setIsEditing(true)} className="text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded transition">
                            ✏️ 情報を編集
                        </button>
                    )}
                </div>

                {isEditing ? (
                    /* ▼▼▼ 編集モード ▼▼▼ */
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">氏名</label><input type="text" className="w-full border rounded p-2" value={basicFormData.name} onChange={e => setBasicFormData({...basicFormData, name: e.target.value})} /></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">相談者タイプ</label><select className="w-full border rounded p-2" value={basicFormData.consulteeType} onChange={e => setBasicFormData({...basicFormData, consulteeType: e.target.value})}><option value="student">生徒本人</option><option value="adult">大人</option></select></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">都道府県</label><select className="w-full border rounded p-2" value={basicFormData.prefecture} onChange={e => setBasicFormData({...basicFormData, prefecture: e.target.value})}>{PREFECTURES.map(p => <option key={p} value={p}>{p}</option>)}<option value="海外・その他">海外・その他</option></select></div>
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">学校段階</label><select className="w-full border rounded p-2" value={basicFormData.schoolStage} onChange={e => setBasicFormData({...basicFormData, schoolStage: e.target.value})}><option value="elem">小学校</option><option value="middle">中学校</option><option value="high">高等学校</option><option value="secondary">中高一貫</option><option value="other">その他</option></select></div>
                        </div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">相談概要（件名）</label><input type="text" className="w-full border rounded p-2" value={basicFormData.summary} onChange={e => setBasicFormData({...basicFormData, summary: e.target.value})} /></div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">詳細内容</label><textarea rows={6} className="w-full border rounded p-2" value={basicFormData.detail} onChange={e => setBasicFormData({...basicFormData, detail: e.target.value})} /></div>
                        
                        <div className="flex justify-end gap-3 pt-4 border-t">
                            <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">キャンセル</button>
                            <button onClick={handleSaveBasicInfo} className="px-6 py-2 bg-indigo-600 text-white font-bold rounded hover:bg-indigo-700 shadow">更新する</button>
                        </div>
                    </div>
                ) : (
                    /* ▼▼▼ 通常表示モード (既存の表示部分を少し整理) ▼▼▼ */
                    <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <dl className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded border border-blue-100">
                                <div className="flex justify-between items-center mb-2"><dt className="text-xs font-bold text-blue-800 uppercase">担当スタッフ</dt><button onClick={assignToMe} className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded hover:bg-blue-50 shadow-sm">自分を割り当て</button></div>
                                <dd className="grid grid-cols-2 gap-2">{staffList.map((staff) => (<label key={staff.email} className="flex items-center space-x-2 cursor-pointer bg-white p-2 rounded shadow-sm hover:bg-gray-50"><input type="checkbox" checked={assignedList.includes(staff.email)} onChange={() => toggleStaff(staff.email)} className="form-checkbox h-4 w-4 text-blue-600 rounded" /><span className="text-sm text-gray-700 font-medium">{staff.name}</span></label>))}</dd>
                            </div>
                            <div><dt className="text-sm text-gray-500">属性</dt><dd className="text-lg font-medium text-gray-900">{caseData.consulteeType === 'student' ? '生徒本人' : '大人'} ({caseData.schoolStage})</dd></div>
                            <div><dt className="text-sm text-gray-500">学校</dt><dd className="text-lg font-medium text-gray-900">{caseData.prefecture} / {caseData.schoolType === 'public' ? '公立' : '私立'}</dd></div>
                        </dl>
                        <div className="bg-gray-50 p-4 rounded-lg"><h3 className="font-bold text-gray-600 mb-1 text-sm">概要</h3><p className="text-gray-900 font-bold mb-4">{caseData.summary}</p><h3 className="font-bold text-gray-600 mb-1 text-sm">詳細</h3><p className="text-gray-800 whitespace-pre-wrap text-sm leading-relaxed">{caseData.detail}</p></div>
                    </div>
                    <div className="mt-8 pt-6 border-t flex items-center justify-between"><span className="font-bold text-gray-700">ステータス:</span><div className="flex gap-2">{['new', 'in_progress', 'completed'].map((sk) => (<button key={sk} onClick={() => handleStatusChange(sk)} className={`px-4 py-2 rounded-full text-sm font-bold ${caseData.status === sk ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 border'}`}>{sk}</button>))}</div></div>
                    </>
                )}
            </div>
            {/* ▼▼▼ 復活: 相談記録（タイムライン） ▼▼▼ */}
            <div className="bg-white rounded-lg shadow border-t-4 border-green-500 overflow-hidden mt-6">
                <div className="p-4 bg-green-50 border-b border-green-100 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-green-900 flex items-center gap-2">📝 相談記録・対応履歴</h2>
                    <span className="text-xs text-green-700 bg-white px-2 py-1 rounded border border-green-200">スタッフ共有用</span>
                </div>
                
                {/* 記録の入力エリア */}
                <div className="p-6 border-b bg-gray-50">
                    <div className="flex gap-2">
                         <textarea 
                            className="flex-1 border border-gray-300 rounded p-3 text-sm text-gray-900 focus:ring-2 focus:ring-green-500 focus:border-transparent transition" 
                            rows={3}
                            placeholder="対応内容や連絡事項を入力してください..." 
                            value={newRecord} 
                            onChange={(e) => setNewRecord(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end mt-2">
                        <button 
                            onClick={handleAddRecord} 
                            disabled={isSending || !newRecord.trim()} 
                            className="bg-green-600 text-white px-6 py-2 rounded font-bold hover:bg-green-700 disabled:opacity-50 transition shadow-sm flex items-center gap-2"
                        >
                            {isSending ? '送信中...' : '記録を追加'}
                        </button>
                    </div>
                </div>

                {/* 過去の記録リスト */}
                <div className="p-6 bg-white max-h-[500px] overflow-y-auto space-y-4">
                    {records.length === 0 ? (
                        <div className="text-center text-gray-400 py-4">まだ記録はありません</div>
                    ) : (
                        records.map((rec) => (
                            <div key={rec.id} className="border-b last:border-0 pb-4 last:pb-0">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-gray-800 text-sm">{rec.createdBy || '担当者'}</span>
                                    <span className="text-xs text-gray-500">
                                        {rec.createdAt?.toDate ? rec.createdAt.toDate().toLocaleString() : '---'}
                                    </span>
                                </div>
                                <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                                    {rec.content}
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* === 右カラム: AIアドバイザー === */}
        <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white rounded-xl shadow-lg border border-indigo-100 h-[calc(100vh-120px)] flex flex-col overflow-hidden">
                <div className="bg-indigo-600 p-4 text-white font-bold flex items-center justify-between shadow-sm shrink-0">
                   <span className="flex items-center gap-2">🤖 AIアドバイザー (履歴保存)</span>
                   <span className="text-xs bg-indigo-500 px-2 py-0.5 rounded">Doc対応</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {aiMessages.length === 0 && (
                        <div className="text-center text-gray-400 text-sm mt-10">
                            この案件についてAIと会話できます。<br/>履歴は自動保存されます。
                        </div>
                    )}
                    {aiMessages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[90%] rounded-lg p-3 text-sm leading-relaxed ${
                                msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white' 
                                    : 'bg-white border text-gray-800 shadow-sm'
                            }`}>
                                <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                        </div>
                    ))}
                    {isAiThinking && (
                        <div className="flex justify-start">
                           <div className="bg-white border p-3 rounded-lg shadow-sm text-xs text-gray-500 flex items-center gap-2">
                               <div className="animate-spin h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                               AIが考え中...
                           </div>
                        </div>
                    )}
                </div>

                <div className="p-3 bg-white border-t shrink-0">
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                            placeholder="質問を入力..." 
                            value={aiInput} 
                            onChange={(e) => setAiInput(e.target.value)} 
                            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleAiSend()} 
                        />
                        <button 
                            onClick={handleAiSend} 
                            disabled={isAiThinking || !aiInput.trim()} 
                            className="bg-indigo-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 transition"
                        >
                            送信
                        </button>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
}