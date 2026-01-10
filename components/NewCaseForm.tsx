'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation'; // ★追加: 画面移動用
import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// 47都道府県のリスト
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

export default function NewCaseForm() {
  const router = useRouter(); // ★追加
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    consulteeType: 'student', 
    relationship: '',        
    prefecture: '',          
    schoolType: 'public', 
    schoolStage: 'high',  
    grade: '1',
    summary: '',
    detail: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Firebaseに保存
      const docRef = await addDoc(collection(db, "cases"), {
        ...formData,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      
      // ▼▼▼ 2. Slack通知を送る (追加部分) ▼▼▼
      try {
        await fetch('/api/slack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: docRef.id,
            name: formData.name,
            type: formData.consulteeType,
            summary: formData.summary
          }),
        });
      } catch (slackError) {
        console.error("Slack通知エラー:", slackError);
        // 通知失敗しても登録は成功しているので、処理は止めない
      }
      // ▲▲▲ 追加ここまで ▲▲▲

      alert('登録しました！');
      
      // 登録後はダッシュボードに戻る方が便利です
      router.push('/dashboard'); 

    } catch (error) {
      console.error(error);
      alert('エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">新規相談登録</h2>

      {/* 相談者タイプ */}
      <div className="mb-6 bg-blue-50 p-4 rounded-md">
        <label className="block text-gray-700 font-bold mb-2">相談者はどなたですか？</label>
        <div className="flex gap-6">
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="consulteeType"
              value="student"
              checked={formData.consulteeType === 'student'}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600"
            />
            <span className="text-gray-800">生徒本人</span>
          </label>
          <label className="flex items-center cursor-pointer">
            <input
              type="radio"
              name="consulteeType"
              value="adult"
              checked={formData.consulteeType === 'adult'}
              onChange={handleChange}
              className="mr-2 h-4 w-4 text-blue-600"
            />
            <span className="text-gray-800">大人（保護者・教員等）</span>
          </label>
        </div>
      </div>

      {/* 氏名 */}
      <div className="mb-4">
        <label className="block text-gray-700 font-bold mb-2">相談者氏名</label>
        <input
          type="text"
          name="name"
          required
          value={formData.name}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          placeholder="山田 太郎"
        />
      </div>

      {/* 続柄（大人の時だけ表示） */}
      {formData.consulteeType === 'adult' && (
        <div className="mb-6 animate-fadeIn">
          <label className="block text-gray-700 font-bold mb-2">生徒との関係（続柄）</label>
          <input
            type="text"
            name="relationship"
            value={formData.relationship}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black bg-yellow-50"
            placeholder="例：母、父、担任教員、スクールカウンセラー"
          />
        </div>
      )}

      {/* 学校情報エリア */}
      <div className="mb-6 pt-4 border-t">
        <p className="text-sm text-gray-500 mb-2">
          ※以下には、<span className="font-bold text-gray-700">対象となる児童・生徒の学校情報</span>を入力してください。
        </p>
        
        {/* 都道府県 */}
        <div className="mb-4">
          <label className="block text-gray-700 font-bold mb-2">学校の都道府県</label>
          <select 
            name="prefecture" 
            value={formData.prefecture} 
            onChange={handleChange} 
            className="w-full px-3 py-2 border rounded-lg text-black"
          >
            <option value="">選択してください</option>
            {PREFECTURES.map((pref) => (
              <option key={pref} value={pref}>
                {pref}
              </option>
            ))}
            <option value="海外・その他">海外・その他</option>
          </select>
        </div>

        <div className="flex gap-4 mb-4">
          <div className="w-1/3">
            <label className="block text-gray-700 font-bold mb-2">設置区分</label>
            <select name="schoolType" value={formData.schoolType} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-black">
              <option value="public">公立</option>
              <option value="private">私立</option>
              <option value="national">国立</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="w-1/3">
            <label className="block text-gray-700 font-bold mb-2">学校段階</label>
            <select name="schoolStage" value={formData.schoolStage} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-black">
              <option value="elem">小学校</option>
              <option value="middle">中学校</option>
              <option value="high">高等学校</option>
              <option value="secondary">中高一貫</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="w-1/3">
            <label className="block text-gray-700 font-bold mb-2">学年</label>
            <select name="grade" value={formData.grade} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg text-black">
              <option value="1">1年</option>
              <option value="2">2年</option>
              <option value="3">3年</option>
              <option value="4">4年</option>
              <option value="5">5年</option>
              <option value="6">6年/卒</option>
            </select>
          </div>
        </div>
      </div>

      {/* 相談概要 */}
      <div className="mb-4">
        <label className="block text-gray-700 font-bold mb-2">相談概要（件名）</label>
        <input
          type="text"
          name="summary"
          required
          value={formData.summary}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          placeholder="例：ツーブロック禁止について"
        />
      </div>

      {/* 詳細内容 */}
      <div className="mb-6">
        <label className="block text-gray-700 font-bold mb-2">詳細内容</label>
        <textarea
          name="detail"
          rows={5}
          value={formData.detail}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
          placeholder="相談の本文を入力..."
        ></textarea>
      </div>

      {/* 送信ボタン */}
      <button
        type="submit"
        disabled={loading}
        className={`w-full font-bold py-3 px-4 rounded-lg text-white transition duration-300 ${
          loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {loading ? '送信中...' : 'この内容で登録する'}
      </button>
    </form>
  );
}