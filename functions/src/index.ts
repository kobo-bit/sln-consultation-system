// ★ここを "firebase-functions/v1" に変更して、古い書き方を明示的に許可します
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { google } from "googleapis";

admin.initializeApp();
const db = admin.firestore();

// ▼▼▼ 設定エリア（ここを自分のIDに書き換えてください） ▼▼▼
const PARENT_FOLDER_ID = process.env.PARENT_FOLDER_ID; 
const TEMPLATE_DOC_ID = process.env.TEMPLATE_DOC_ID;
const CALENDAR_ID = process.env.CALENDAR_ID;

export const createDriveResources = functions.region('us-central1').firestore
  .document('cases/{caseId}')
  .onCreate(async (snap: any, context: any) => {
    
    const newData = snap.data();
    const caseId = context.params.caseId;
    const caseNumber = newData.caseNumber;
    
    // --- 1. データの翻訳・加工処理エリア ---
    
    // 名前 (DB: name -> Doc: clientName)
    const clientName = newData.name || "名称未設定";

    // --- 学校属性の作成 (子供の情報) ---
    let stageLabel = "";
    switch (newData.schoolStage) {
      case 'secondary': stageLabel = "中高一貫"; break; // ★追加: 中高一貫
      case 'high': stageLabel = "高校"; break;
      case 'middle': stageLabel = "中学"; break;
      case 'elem': stageLabel = "小学"; break;
      case 'univ': stageLabel = "大学"; break;
      default: stageLabel = newData.schoolStage || "";
    }
    const gradeLabel = newData.grade ? `${newData.grade}年生` : "";
    const childSchoolAttr = `${stageLabel}${gradeLabel}`;

    // --- 相談者属性の分岐ロジック (大人 or 子供) ---
    // DB側で consulteeType: 'student' | 'adult' を送ってください
    // 大人の場合は relationship: '保護者' | '教員' 等が入る想定
    let finalClientAttr = "";

    if (newData.consulteeType === 'adult') {
        // 大人の場合: "保護者 (子: 高校1年生)" のように表記
        const rel = newData.relationship || "関係者";
        finalClientAttr = `${rel} (子: ${childSchoolAttr})`;
    } else {
        // 生徒本人の場合: そのまま "高校1年生" と表記
        finalClientAttr = childSchoolAttr;
    }

    // --- 詳細 (都道府県 + 学校種別) ---
    // DB: prefecture="東京都", schoolType="public" -> Doc: "東京都・公立"
    let typeLabel = "";
    switch (newData.schoolType) {
      case 'public': typeLabel = "公立"; break;
      case 'private': typeLabel = "私立"; break;
      case 'national': typeLabel = "国立"; break;
      default: typeLabel = newData.schoolType || "";
    }
    
    const prefecture = newData.prefecture || ""; // ★追加: 都道府県
    // 都道府県と学校種別を「・」でつなぐ
    const clientDetail = [prefecture, typeLabel].filter(Boolean).join("・");


    // 日付 (DB: createdAt -> Doc: start_date)
    let startDate = "";
    if (newData.createdAt) {
       const d = newData.createdAt.toDate ? newData.createdAt.toDate() : new Date(newData.createdAt);
       if (!isNaN(d.getTime())) {
         const y = d.getFullYear();
         const m = ('0' + (d.getMonth() + 1)).slice(-2);
         const d_str = ('0' + d.getDate()).slice(-2);
         startDate = `${y}-${m}-${d_str}`;
       }
    }

    // ファイル名用日付
    //const today = new Date();
    //const dateStrForTitle = today.toISOString().slice(0, 10).replace(/-/g, "");
    
    // ドキュメント名
    //const docName = `[${dateStrForTitle}] 相談記録_${clientName}_${caseId}`;
    const numberStr = caseNumber ? String(caseNumber).padStart(4, '0') : "0000";
    
    const docName = `${numberStr}_${clientName}`;

    // --- 加工終わり ---

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/documents'
        ]
      });
      const authClient = await auth.getClient();
      
      const drive = google.drive({ version: 'v3', auth: authClient as any });
      const docs = google.docs({ version: 'v1', auth: authClient as any });

      let newDocLink = "";
      if (TEMPLATE_DOC_ID && PARENT_FOLDER_ID) {
        const copyRes = await drive.files.copy({
          fileId: TEMPLATE_DOC_ID,
          supportsAllDrives: true,
          requestBody: {
            name: docName,
            parents: [PARENT_FOLDER_ID]
          },
          fields: 'id, webViewLink'
        });
        newDocLink = copyRes.data.webViewLink || "";
        const newFileId = copyRes.data.id || "";
        console.log(`ドキュメント作成成功: ${newDocLink}`);

        // ドキュメントのプレースホルダーを置換
        if (newFileId) {
          const requests = [
            {
              replaceAllText: {
                containsText: { text: '{{client_name}}', matchCase: true },
                replaceText: clientName
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{client_attr}}', matchCase: true },
                replaceText: finalClientAttr // ★分岐済みの属性を使用
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{client_detail}}', matchCase: true },
                replaceText: clientDetail // ★都道府県・公立などの結合文字
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{summary}}', matchCase: true },
                replaceText: newData.summary || ""
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{start_date}}', matchCase: true },
                replaceText: startDate
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{end_date}}', matchCase: true },
                replaceText: "" 
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{method}}', matchCase: true },
                replaceText: "" 
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{manager_name}}', matchCase: true },
                replaceText: "" 
              }
            },
            {
              replaceAllText: {
                containsText: { text: '{{note}}', matchCase: true },
                replaceText: newData.detail || "" 
              }
            }
          ];

          await docs.documents.batchUpdate({
            documentId: newFileId,
            requestBody: {
              requests: requests
            }
          });

          console.log('ドキュメントの更新が完了しました');
        }
      }

      await db.collection('cases').doc(caseId).update({
        documentUrl: newDocLink,
        systemStatus: 'Drive連携完了'
      });

    } catch (error) {
      console.error("ドライブ連携エラー:", error);
      await db.collection('cases').doc(caseId).update({
        systemStatus: 'Drive連携失敗: ' + error
      });
    }
  });
  export const syncScheduleToCalendar = functions.region('us-central1').firestore
  .document('cases/{caseId}')
  .onUpdate(async (change: any, context: any) => {
    
    const newData = change.after.data();
    const oldData = change.before.data();
    const caseId = context.params.caseId;

    // 変更がなければ終了
    const isTimeChanged = !newData.meetingDate?.isEqual(oldData.meetingDate);
    const isLocationChanged = newData.locationOrUrl !== oldData.locationOrUrl;
    if (!newData.meetingDate || (!isTimeChanged && !isLocationChanged)) {
      return null;
    }

    try {
      // 1. 標準の認証を使う (鍵ファイル不要！)
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/calendar']
      });
      const authClient = await auth.getClient();
      const calendar = google.calendar({ version: 'v3', auth: authClient as any });

      const eventStart = newData.meetingDate.toDate();
      const eventEnd = new Date(eventStart.getTime() + 60 * 60 * 1000);

      // 2. シンプルな予定データ (Meet機能、招待機能はカット)
      const eventBody = {
        summary: `面談: ${newData.name} 様`,
        description: `相談ID: ${caseId}\n概要: ${newData.summary}\n詳細: ${newData.locationOrUrl}\n\n【参加予定者】\n${newData.attendeeEmails || 'なし'}`,
        start: { dateTime: eventStart.toISOString() },
        end: { dateTime: eventEnd.toISOString() },
        location: newData.locationOrUrl
      };

      if (newData.calendarEventId) {
        // 更新
        await calendar.events.update({
          calendarId: CALENDAR_ID,
          eventId: newData.calendarEventId,
          requestBody: eventBody
        });
        console.log(`カレンダー更新成功`);
      } else {
        // 新規作成
        const res = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: eventBody
        });
        
        await db.collection('cases').doc(caseId).update({
          calendarEventId: res.data.id
        });
        console.log(`カレンダー作成成功: ${res.data.id}`);
      }

    } catch (error) {
      console.error("カレンダー連携エラー:", error);
    }
    return null;
  });