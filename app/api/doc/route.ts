// app/api/doc/route.ts
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(req: Request) {
  try {
    const { documentUrl } = await req.json();

    if (!documentUrl) {
      return NextResponse.json({ text: "" }); // URLがなければ空文字を返す
    }

    // 1. URLからドキュメントIDを抽出する
    // https://docs.google.com/document/d/xxxxx/edit... -> xxxxx を取り出す
    const match = documentUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    const documentId = match[1];

    // 2. サービスアカウントで認証 (環境変数の秘密鍵を使用)
    // ※改行コード(\n)の扱いに注意して整形
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });

    const docs = google.docs({ version: 'v1', auth });

    // 3. ドキュメントの中身を取得
    const res = await docs.documents.get({ documentId });
    const content = res.data.body?.content;

    // 4. 複雑なJSONデータから「ただのテキスト」だけを抜き出す
    let fullText = '';
    if (content) {
      content.forEach((element) => {
        if (element.paragraph?.elements) {
          element.paragraph.elements.forEach((elem) => {
            if (elem.textRun?.content) {
              fullText += elem.textRun.content;
            }
          });
        }
      });
    }

    return NextResponse.json({ text: fullText });

  } catch (error) {
    console.error("Doc Fetch Error:", error);
    // エラーでもシステムを止めないよう、空文字などを返す
    return NextResponse.json({ text: "（ドキュメントの読み込みに失敗しました。権限などを確認してください）" });
  }
}