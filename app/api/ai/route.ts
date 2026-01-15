// app/api/ai/route.ts
import { NextResponse } from 'next/server';
import { VertexAI } from '@google-cloud/vertexai';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    // 認証情報：改行コードの修正
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
        : undefined;

    // ▼▼▼ Vertex AIの初期化 ▼▼▼
    const vertex_ai = new VertexAI({
      
      // ★ここに「正しいプロジェクトID」を入力してください（例: sln-system-12345）
      project: process.env.FIREBASE_PROJECT_ID, 
      // ★迷ったらまずは 'us-central1' (米国) で試すのが一番確実です
      location: 'us-central1', 
      
      googleAuthOptions: {
        credentials: {
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: privateKey,
        }
      }
    });

    // ▼▼▼ モデルの指定 ▼▼▼
    // 最新のFlashモデル指定
    const model = vertex_ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.4,
      },
    });

    // 生成実行
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.candidates?.[0].content.parts?.[0].text || "";

    return NextResponse.json({ text });

  } catch (error: any) {
    console.error("Vertex AI Error:", error);
    // エラー詳細をコンソールに出しつつ、フロントにも返す
    return NextResponse.json({ 
        error: "AI processing failed", 
        details: error.message || String(error) 
    }, { status: 500 });
  }
}