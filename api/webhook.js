// api/webhook.js
// LINE Webhook - 友だち追加時に診断結果に基づいたレポートURLを送信

import crypto from 'crypto';

// タイプ名のマッピング
const TYPE_NAMES = {
  CONTRACT: '業務委託バランス型',
  TOP: '指名売上トップ型',
  STAR: 'SNS発信スター型',
  MANAGER: 'マネジメントリーダー型',
  EDU: '教育トレーナー型',
  MENTOR: 'メンター指導型',
  CRAFTER: '純粋技術追求職人型',
  FREELANCE: 'ソロ独立スタイリスト型',
  CREATOR: '世界観クリエイター型',
  NO2: '最強ストラテジスト参謀型',
  EXEC: '組織執行役員型',
  SOLO: '孤高の職人オーナー型',
  MICRO: '小規模プレイングオーナー型',
  MULTI: '多店舗展開オーナー型',
  SCALE: '多店舗拡大オーナー型',
  FC: 'フランチャイズリスク分散型'
};

// 署名検証
function verifySignature(body, signature, secret) {
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

// LINE Push Message
async function pushMessage(userId, messages, accessToken) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      to: userId,
      messages: messages
    })
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error('LINE Push error:', errText);
  }
  
  return response;
}

// KVからデータ取得
async function getFromKV(userId) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  
  if (!kvUrl || !kvToken) return null;
  
  try {
    const response = await fetch(`${kvUrl}/get/bti:${userId}`, {
      headers: {
        Authorization: `Bearer ${kvToken}`
      }
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.result) {
      return JSON.parse(data.result);
    }
    return null;
  } catch (e) {
    console.error('KV get error:', e);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  
  if (!channelSecret || !accessToken) {
    console.error('LINE environment variables not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  
  // 署名検証
  const signature = req.headers['x-line-signature'];
  const rawBody = JSON.stringify(req.body);
  
  if (!signature || !verifySignature(rawBody, signature, channelSecret)) {
    console.error('Invalid signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }
  
  try {
    const events = req.body.events || [];
    
    for (const event of events) {
      // 友だち追加イベント
      if (event.type === 'follow') {
        const userId = event.source.userId;
        console.log(`New follower: ${userId}`);
        
        // KVから診断結果を取得
        const btiData = await getFromKV(userId);
        
        if (btiData) {
          // 診断結果がある → 挨拶 + レポートURLを送信
          const typeName = TYPE_NAMES[btiData.type] || btiData.type;
          const reportUrl = `https://bti-web.vercel.app/report.html?type=${btiData.type}&pattern=${btiData.pattern}`;
          
          await pushMessage(userId, [
            {
              type: 'text',
              text: `サロン研究所.comです！\nLINE追加ありがとうございます 🙏\n\nあなたのBTI診断結果をもとに、深掘りレポートを用意しました。\n\n下のボタンから読めます 👇`
            },
            {
              type: 'template',
              altText: `あなたのタイプは「${typeName}」です。深掘りレポートを読む`,
              template: {
                type: 'buttons',
                title: `あなたは「${typeName}」`,
                text: 'あなただけの深掘りレポートです。',
                actions: [
                  {
                    type: 'uri',
                    label: '深掘りレポートを読む',
                    uri: reportUrl
                  }
                ]
              }
            }
          ], accessToken);
          
          console.log(`Sent report to ${userId}: ${btiData.type} pattern ${btiData.pattern}`);
          
        } else {
          // 診断結果がない → 通常のあいさつ
          await pushMessage(userId, [
            {
              type: 'text',
              text: `サロン研究所.comです！\nLINE追加ありがとうございます 🙏\n\nBTI（美容師タイプ診断）の深掘りレポートをお届けします。\n\nまだ診断がお済みでない方は、下のメニューから「BTI診断もう一度」をタップしてください。`
            }
          ], accessToken);
          
          console.log(`Sent welcome (no BTI data) to ${userId}`);
        }
      }
      
      // テキストメッセージ受信（キャリア相談など）
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text;
        const userId = event.source.userId;
        
        // 「深掘りレポート」キーワードでレポート再送
        if (text.includes('深掘り') || text.includes('レポート')) {
          const btiData = await getFromKV(userId);
          
          if (btiData) {
            const typeName = TYPE_NAMES[btiData.type] || btiData.type;
            const reportUrl = `https://bti-web.vercel.app/report.html?type=${btiData.type}&pattern=${btiData.pattern}`;
            
            await pushMessage(userId, [
              {
                type: 'template',
                altText: `あなたのタイプは「${typeName}」です。深掘りレポートを読む`,
                template: {
                  type: 'buttons',
                  title: `あなたは「${typeName}」`,
                  text: 'あなたの深掘りレポートです。',
                  actions: [
                    {
                      type: 'uri',
                      label: '深掘りレポートを読む',
                      uri: reportUrl
                    }
                  ]
                }
              }
            ], accessToken);
          } else {
            await pushMessage(userId, [
              {
                type: 'text',
                text: `診断結果が見つかりませんでした。\n\n下のメニューから「BTI診断もう一度」をタップして、診断を受けてみてください。`
              }
            ], accessToken);
          }
        }
        
        // 「キャリア相談」キーワード
        if (text.includes('キャリア相談')) {
          await pushMessage(userId, [
            {
              type: 'text',
              text: `キャリア相談のご連絡ありがとうございます。\n\nまず、あなたのお悩みを聞かせてください。\n\n◆ 今の職場への不満\n◆ 転職のタイミング\n◆ 年収・待遇について\n◆ 独立・フリーランスについて\n◆ その他\n\nどんな小さなことでも大丈夫です。\nこのトークに返信してください 👇`
            }
          ], accessToken);
        }
      }
    }
    
    return res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
