import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { name, type, summary, id } = await req.json();
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json({ error: "No Webhook URL" }, { status: 500 });
    }

    // ★メンションの設定
    // Sから始まるIDはユーザーグループ(User Group)です。
    // APIでメンションするには <!subteam^ID> という形式を使います。
    const groupMention = "<!subteam^S07M7SN7NSZ>";

    // Slackへの通知メッセージ
    const message = {
      // textはスマホのバナー通知などに表示される文章です（ここにもメンションを入れておくと気付きやすいです）
      text: `${groupMention} 🆕 新規相談: ${name}様`, 
      
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            // 本文の最初にメンションを表示
            text: `${groupMention} 新しい相談案件が登録されました。`
          }
        },
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📝 相談内容の詳細",
            emoji: true
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*相談者:*\n${name} 様 (${type === 'student' ? '生徒' : '大人'})`
            },
            {
              type: "mrkdwn",
              text: `*概要:*\n${summary}`
            }
          ]
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "👉 ダッシュボードで確認する",
                emoji: true
              },
              // 本番環境のURLに合わせてください
              url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://sln-consultation-system.vercel.app'}/cases/${id}`,
              style: "primary"
            }
          ]
        }
      ]
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}