// api/notify-bot-webhook.js
// 通知Bot（BTI通知Bot @581miikc）専用のWebhook
// 目的：
//  1. オーナー（Makoto）がBotにメッセージ送信 → userIdをログ出力
//     → これでNOTIFY_LINE_USER_ID環境変数にセットする値が取得できる
//  2. 他の人が間違って追加した場合に「これは内部用ボットです」と返信

import crypto from 'crypto';

function verifySignature(body, signature, secret) {
  const hash = crypto
    .createHmac('SHA256', secret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

async function pushMessage(userId, messages, accessToken) {
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ to: userId, messages })
  });
  if (!response.ok) {
    const err = await response.text();
    console.error('Notify push error:', err);
  }
  return response;
}

async function replyMessage(replyToken, messages, accessToken) {
  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({ replyToken, messages })
  });
  if (!response.ok) {
    const err = await response.text();
    console.error('Notify reply error:', err);
  }
  return response;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const channelSecret = process.env.NOTIFY_LINE_CHANNEL_SECRET;
  const accessToken = process.env.NOTIFY_LINE_ACCESS_TOKEN;

  if (!channelSecret || !accessToken) {
    console.error('Notify Bot env vars not set');
    return res.status(500).json({ error: 'Server config error' });
  }

  const signature = req.headers['x-line-signature'];
  const rawBody = JSON.stringify(req.body);

  if (!signature || !verifySignature(rawBody, signature, channelSecret)) {
    console.error('Notify webhook: invalid signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const events = req.body.events || [];

    for (const event of events) {
      // 友だち追加イベント
      if (event.type === 'follow') {
        const userId = event.source.userId;
        console.log('=== NOTIFY BOT NEW FOLLOWER ===');
        console.log('UserID:', userId);
        console.log('==============================');

        await replyMessage(event.replyToken, [
          {
            type: 'text',
            text: 'BTI通知Botへようこそ。\n\nこれはオーナー専用の通知ボットです。\nUserID: ' + userId + '\n\n(このIDをVercelの環境変数 NOTIFY_LINE_USER_ID に設定してください)'
          }
        ], accessToken);
      }

      // テキストメッセージ受信
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        console.log('=== NOTIFY BOT MESSAGE ===');
        console.log('From UserID:', userId);
        console.log('Message:', event.message.text);
        console.log('==========================');

        // userIdを返信（環境変数にセットしやすいよう）
        await replyMessage(event.replyToken, [
          {
            type: 'text',
            text: 'あなたのUserID:\n' + userId + '\n\nこのIDをVercel環境変数 NOTIFY_LINE_USER_ID に設定すると、ホットリード通知が届くようになります。'
          }
        ], accessToken);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Notify webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
