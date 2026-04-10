# 10. Watcher Spec

## 1. Mục tiêu
Watcher là tiến trình nền trong cùng repo, có nhiệm vụ:
- đồng bộ config từ backend
- gửi heartbeat
- nhận event từ source adapter
- chuẩn hóa payload mức tối thiểu
- gửi payload lên ingest API
- retry khi lỗi mạng/API

## 2. Ranh giới trách nhiệm
Watcher **không**:
- ghi DB trực tiếp
- chạy rule engine đầy đủ
- gửi Telegram trực tiếp
- chứa logic UI
- chứa chi tiết né phát hiện

Watcher **có**:
- source adapter abstraction
- mock adapter
- config sync
- heartbeat
- outbound HTTP client
- optional local buffer

## 3. Adapter abstraction
Watcher phải expose một abstraction kiểu:

```ts
interface SourceAdapter {
  start(onEvent: (event: SourceMessageEvent) => Promise<void>): Promise<void>
  stop(): Promise<void>
}
```

`SourceMessageEvent` tối thiểu:
```ts
type SourceMessageEvent = {
  source: "zalo"
  groupExternalId: string
  groupName?: string
  messageExternalId?: string
  senderExternalId?: string
  senderName?: string
  messageText: string
  messageTime: string
  rawPayload?: unknown
}
```

## 4. Mock adapter là bắt buộc
Phase 1 phải có `mock adapter` để:
- emit events từ file fixture
- hoặc emit event theo interval
- giúp test toàn pipeline không cần source thật

## 5. Config sync
Watcher định kỳ gọi:
- `GET /api/watcher/config`

Mục tiêu:
- biết group nào đang bật
- biết watcher identity
- có thể log cấu hình hiện tại

Chu kỳ gợi ý:
- mỗi 60 giây
- hoặc khi start + timer

## 6. Heartbeat
Watcher gọi:
- `POST /api/watcher/heartbeat`

Chu kỳ gợi ý:
- mỗi 30 giây

Payload:
```json
{
  "version": "0.1.0",
  "status": "online"
}
```

## 7. Gửi message
Khi có event:
1. map event sang ingest payload
2. validate local
3. POST `/api/watcher/messages`
4. nếu fail, retry
5. log kết quả

## 8. Retry
- retry với exponential backoff đơn giản
- nếu API unreachable, có thể buffer vào file JSONL cục bộ
- khi kết nối lại, flush buffer

## 9. Runtime modes
### Mock mode
- dùng fixtures
- dành cho dev/test

### Adapter mode
- hook vào source adapter thật
- ngoài scope phase 1, nhưng watcher contract phải sẵn

## 10. Các lệnh gợi ý
- `npm run watcher:mock`
- `npm run watcher`
- `npm run worker`
- `npm run dev`

## 11. Deliverable tối thiểu cho watcher
- module runtime
- config client
- heartbeat client
- ingest client
- mock adapter
- fixture messages
- logs
