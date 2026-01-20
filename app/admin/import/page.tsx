'use client';

import { useState } from 'react';
import { db } from '../../../lib/firebase';
import { writeBatch, collection, doc, Timestamp } from 'firebase/firestore';

// CSVパース関数
const parseCSVLine = (text: string) => {
  const result = [];
  let start = 0;
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      inQuotes = !inQuotes;
    } else if (text[i] === ',' && !inQuotes) {
      let field = text.substring(start, i);
      if (field.startsWith('"') && field.endsWith('"')) {
        field = field.slice(1, -1).replace(/""/g, '"');
      }
      result.push(field);
      start = i + 1;
    }
  }
  let lastField = text.substring(start);
  if (lastField.startsWith('"') && lastField.endsWith('"')) {
    lastField = lastField.slice(1, -1).replace(/""/g, '"');
  }
  result.push(lastField);
  return result;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
      
      // 1行目はヘッダーとしてスキップ
      const data = lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        if (cols.length < 2) return null;

        // ★列順: number, name, date, type, status, schoolType, schoolStage, grade, schoolName, prefecture, documentUrl, summary, assignedTo, detail
        return {
            number: cols[0]?.trim(),
            name: cols[1]?.trim(),
            date: cols[2]?.trim(),
            type: cols[3]?.trim(),
            status: cols[4]?.trim(),
            schoolType: cols[5]?.trim(),
            schoolStage: cols[6]?.trim(),
            grade: cols[7]?.trim(),
            schoolName: cols[8]?.trim(),
            prefecture: cols[9]?.trim(),
            documentUrl: cols[10]?.trim(),
            summary: cols[11]?.trim(),
            assignedTo: cols[12]?.trim(), // ★M列: 担当者
            detail: cols[13]?.trim()      // ★N列: 詳細
        };
      }).filter(d => d !== null);

      setPreview(data);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!preview.length) return;
    if (!confirm(`${preview.length}件のデータをインポートします。よろしいですか？`)) return;

    setLoading(true);
    setLog([]);
    
    try {
      const batch = writeBatch(db);
      const logs: string[] = [];

      preview.forEach((row) => {
        const caseNum = parseInt(row.number, 10);
        if (isNaN(caseNum)) {
            logs.push(`❌ スキップ: 番号不正 (${row.name})`);
            return;
        }

        // --- データ変換 ---
        let cType = 'student';
        if (row.type?.includes('大人') || row.type === 'adult') cType = 'adult';

        let st = 'new';
        if (row.status === '対応中' || row.status === 'in_progress') st = 'in_progress';
        if (row.status === '完了' || row.status === 'completed') st = 'completed';

        let sType = 'public'; 
        if (row.schoolType === '私立' || row.schoolType === 'private') sType = 'private';
        if (row.schoolType === '国立' || row.schoolType === 'national') sType = 'national';
        if (row.schoolType === 'その他' || row.schoolType === 'other') sType = 'other';

        let sStage = 'high';
        if (row.schoolStage === '小学校' || row.schoolStage === 'elem') sStage = 'elem';
        if (row.schoolStage === '中学校' || row.schoolStage === 'middle') sStage = 'middle';
        if (row.schoolStage === '高校' || row.schoolStage?.includes('高等') || row.schoolStage === 'high') sStage = 'high';
        if (row.schoolStage?.includes('中高一貫') || row.schoolStage === 'secondary') sStage = 'secondary';
        if (row.schoolStage === 'その他' || row.schoolStage === 'other') sStage = 'other';

        // 学年変換
        let gr = '1';
        if (row.grade) {
            const match = row.grade.match(/[0-9]+/);
            if (match) gr = match[0];
        }

        // ★担当者変換 (セミコロン区切り -> 配列)
        let assignedList: string[] = [];
        if (row.assignedTo) {
            assignedList = row.assignedTo.split(';').map((s: string) => s.trim()).filter((s: string) => s !== '');
        }

        let createdAt = Timestamp.now();
        if (row.date) {
            const d = new Date(row.date);
            if (!isNaN(d.getTime())) createdAt = Timestamp.fromDate(d);
        }

        // --- 保存データ作成 ---
        const newDocRef = doc(collection(db, "cases"));

        batch.set(newDocRef, {
            caseNumber: caseNum,
            name: row.name || '名称不明',
            consulteeType: cType,
            status: st,
            
            // 学校情報
            schoolType: sType,
            schoolStage: sStage,
            grade: gr,
            schoolName: row.schoolName || '',
            prefecture: row.prefecture || '',

            // 担当者 (配列として保存)
            assignedTo: assignedList,

            documentUrl: row.documentUrl || '',
            summary: row.summary || '（インポートデータ）',
            detail: row.detail || '',
            createdAt: createdAt,
            importedAt: Timestamp.now(),
        });
        
        logs.push(`✅ 追加予定: #${caseNum} ${row.name}`);
      });

      await batch.commit();
      
      setLog([...logs, '🎉 インポート完了しました！']);
      alert('インポートが完了しました。');
      setFile(null);
      setPreview([]);

    } catch (e) {
      console.error(e);
      setLog(prev => [...prev, `❌ エラー: ${e}`]);
      alert('エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📂 過去データ一括インポート (担当者対応)</h1>
      
      <div className="bg-white p-6 rounded shadow mb-6">
        <h2 className="font-bold mb-4">1. CSVファイルを選択</h2>
        <input 
            type="file" 
            accept=".csv" 
            onChange={handleFileChange} 
            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <div className="mt-4 text-xs text-gray-600 bg-gray-100 p-3 rounded leading-relaxed">
            <strong>期待する列順 (A〜N列):</strong><br/>
            number, name, date, type, status, schoolType, schoolStage, grade, schoolName, prefecture, documentUrl, summary, <span className="text-red-600 font-bold">assignedTo</span>, detail
            <br/><br/>
            ※担当者が複数の場合は <code>user1@sln.org; user2@sln.org</code> のようにセミコロン(;)で区切ってください。
        </div>
      </div>

      {preview.length > 0 && (
        <div className="bg-white p-6 rounded shadow mb-6">
            <h2 className="font-bold mb-4">2. プレビュー ({preview.length}件)</h2>
            <div className="max-h-80 overflow-auto border rounded text-sm">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="p-2 border">#</th>
                            <th className="p-2 border">氏名</th>
                            <th className="p-2 border">学校名</th>
                            <th className="p-2 border">担当者(Email)</th>
                            <th className="p-2 border">件名</th>
                        </tr>
                    </thead>
                    <tbody>
                        {preview.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-gray-50">
                                <td className="p-2 font-mono text-blue-600 font-bold">{row.number}</td>
                                <td className="p-2">{row.name}</td>
                                <td className="p-2 text-gray-700">
                                    {row.schoolName} ({row.schoolStage}/{row.grade}年)
                                </td>
                                <td className="p-2 text-xs text-purple-600 font-mono">
                                    {row.assignedTo}
                                </td>
                                <td className="p-2 text-gray-500 truncate max-w-xs">{row.summary}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex justify-end">
                <button 
                    onClick={handleImport} 
                    disabled={loading}
                    className="bg-blue-600 text-white font-bold py-3 px-8 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                    {loading ? 'インポート実行' : '実行する'}
                </button>
            </div>
        </div>
      )}

      {log.length > 0 && (
          <div className="bg-black text-green-400 p-4 rounded font-mono text-sm max-h-60 overflow-auto">
              {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
      )}
    </div>
  );
}