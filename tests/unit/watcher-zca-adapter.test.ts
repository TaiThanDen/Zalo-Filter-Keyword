import assert from "node:assert/strict";
import test from "node:test";
import { ThreadType } from "zca-js";
import {
  extractZcaMessageText,
  mapZcaGroupMessage,
  resolveZcaMessageTime,
} from "@/src/modules/watchers/zca-source-adapter";

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: ThreadType.Group,
    threadId: "group-123",
    isSelf: false,
    data: {
      actionId: "action-1",
      cliMsgId: "client-1",
      content: "Cần tuyển PB ca tối",
      dName: "Nguyễn Văn A",
      msgId: "message-1",
      msgType: "chat.text",
      notify: "Nguyễn Văn A gửi tin nhắn",
      status: 1,
      ts: "1789405200000",
      uidFrom: "user-456",
    },
    ...overrides,
  };
}

test("maps an incoming Zalo group message to the existing watcher contract", () => {
  const payload = mapZcaGroupMessage(createMessage(), "Nhóm tuyển dụng");

  assert.deepEqual(payload, {
    source: "zalo",
    groupExternalId: "group-123",
    groupName: "Nhóm tuyển dụng",
    messageExternalId: "group-123:message-1",
    senderExternalId: "user-456",
    senderName: "Nguyễn Văn A",
    messageText: "Cần tuyển PB ca tối",
    messageTime: "2026-09-14T17:00:00.000Z",
    rawPayload: {
      adapter: "zca-js",
      actionId: "action-1",
      cliMsgId: "client-1",
      msgId: "message-1",
      msgType: "chat.text",
      status: 1,
    },
  });
});

test("ignores direct messages and messages sent by the logged-in account", () => {
  assert.equal(mapZcaGroupMessage(createMessage({ type: ThreadType.User })), null);
  assert.equal(mapZcaGroupMessage(createMessage({ isSelf: true })), null);
});

test("preserves multiline text while normalizing whitespace", () => {
  assert.equal(extractZcaMessageText(" Dòng một  \r\nDòng hai\n\n\nDòng ba "), "Dòng một\nDòng hai\n\nDòng ba");
});

test("extracts searchable text from attachment payloads", () => {
  assert.equal(
    extractZcaMessageText(
      {
        title: "Tuyển nhân viên",
        description: "Ca tối tại Quận 1",
        href: "https://example.com/job",
      },
      "Có một liên kết mới",
    ),
    "Tuyển nhân viên\nCa tối tại Quận 1\nhttps://example.com/job\nCó một liên kết mới",
  );
});

test("accepts both second and millisecond Zalo timestamps", () => {
  assert.equal(resolveZcaMessageTime("1789405200"), "2026-09-14T17:00:00.000Z");
  assert.equal(resolveZcaMessageTime("1789405200000"), "2026-09-14T17:00:00.000Z");
  assert.equal(resolveZcaMessageTime("invalid", 1789405200000), "2026-09-14T17:00:00.000Z");
});
