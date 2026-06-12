import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTelegramMessage, sanitizeTelegramMessageText } from '@/src/modules/notifications/telegram.provider';

test('sanitizeTelegramMessageText removes trailing Zalo clock and reaction commands', () => {
  const sanitized = sanitizeTelegramMessageText(`Mình cần 10Pg- cho mỗi ngày chạy roadshow xe đạp
13/6 Phan Văn Hớn- Tô Ký 2 quận 12
Thời gian :
- Sáng : 7:00-9:30
- Chiều : 16:00-18:30
‼️Lưu ý không boom job, có thể đăng kí làm 1 hoặc 2 ngày
Làm được ib:0334601419-quỳnh
18:12
/-strong
/-heart
:>
:o
:-(( 
:-h`);

  assert.equal(
    sanitized,
    `Mình cần 10Pg- cho mỗi ngày chạy roadshow xe đạp
13/6 Phan Văn Hớn- Tô Ký 2 quận 12
Thời gian :
- Sáng : 7:00-9:30
- Chiều : 16:00-18:30
‼️Lưu ý không boom job, có thể đăng kí làm 1 hoặc 2 ngày
Làm được ib:0334601419-quỳnh`,
  );
});

test('sanitizeTelegramMessageText removes trailing rendered reaction emojis', () => {
  const sanitized = sanitizeTelegramMessageText(`Anh cần tuyển ctr cho khách dùng thử bánh
Zalo a : 0399979032 Chính
16:26
👍
❤️
😆
🙄
😭
😡`);

  assert.equal(
    sanitized,
    `Anh cần tuyển ctr cho khách dùng thử bánh
Zalo a : 0399979032 Chính`,
  );
});

test('renderTelegramMessage omits legacy alert header and uses sanitized body', () => {
  const rendered = renderTelegramMessage({
    groupName: 'SUP MC PG PB HCM - PN',
    senderName: 'Chính',
    messageTime: '2026-06-10T14:27:15.000Z',
    messageText: `Thiếu PG
260k/ca
16:26
/-strong
/-heart`,
    matchedKeywords: ['pg'],
  });

  assert.equal(rendered.includes('[ZALO ALERT]'), false);
  assert.equal(rendered.includes('/-strong'), false);
  assert.equal(rendered.includes('16:26'), false);
  assert.equal(rendered.includes('<b>Nhóm:</b> SUP MC PG PB HCM - PN'), true);
  assert.equal(rendered.includes('<b>Từ khóa khớp:</b> pg'), true);
});
