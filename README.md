# Mini TicketBox

Họ tên: Bùi Đức Huy

Mini TicketBox là ứng dụng fullstack đặt vé concert giới hạn 500 vé, gồm .NET API, PostgreSQL, Redis, SignalR realtime và Angular UI.

## Tech stack

- Backend: ASP.NET Core, EF Core, PostgreSQL, Redis, SignalR.
- Frontend: Angular standalone components, Angular signals, SignalR client.
- Test: xUnit cho domain/realtime contracts.

## Chạy local

### 1. Khởi động hạ tầng

```bash
docker compose up -d
```

### 2. Chạy backend

```bash
dotnet run --project backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

API mặc định chạy tại `http://localhost:5141`, dùng PostgreSQL `localhost:5432`, Redis `localhost:6379`, Swagger ở môi trường Development và SignalR hub tại `/hubs/tickets`.

### 3. Chạy frontend

```bash
cd frontend/mini-ticketbox-web
npm install
npm start
```

Mở `http://localhost:4200`.

## Luồng chức năng

- Trang chủ hiển thị tồn kho realtime theo từng loại vé.
- Trang Booking cho chọn loại vé, giữ vé 5 phút, chặn spam click bằng trạng thái loading/disabled, đồng hồ countdown đồng bộ theo `expiredAt` từ backend.
- API thanh toán giả lập chuyển hold sang paid và tạo order.
- Background service tự release hold hết hạn mỗi 30 giây.
- Trang Admin hiển thị số vé đã bán, doanh thu và danh sách hold đang khóa tạm thời.

## Giải pháp kỹ thuật chính

- Chống overselling: backend giữ vé trong transaction và khóa dòng `TicketTypes` bằng PostgreSQL `FOR UPDATE` trước khi trừ `AvailableQuantity`.
- Hold 5 phút: mỗi hold được lưu trong database và Redis với TTL 5 phút; background service release hold hết hạn và hoàn vé về tồn kho.
- Realtime: SignalR hub broadcast `inventoryChanged` sau reserve, payment và release để frontend/admin cập nhật tức thời.
- Clean code: tách Domain/Application/Infrastructure/API, global exception middleware, response contracts rõ ràng.

## Kiểm thử

```bash
dotnet test backend/tests/MiniTicketBox.UnitTests/MiniTicketBox.UnitTests.csproj
dotnet build backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
cd frontend/mini-ticketbox-web && npm run build
```

Kết quả hiện tại: backend tests pass, API build pass, Angular build pass.

## Load test k6: 5.000 người dùng tranh vé

Kịch bản k6 mô phỏng 5.000 người dùng cùng F5 inventory và bấm đặt vé trong cùng một khoảng thời gian:

- Mỗi VU gọi `GET /api/tickets/snapshot` như hành vi F5/liên tục xem tồn kho.
- Sau đó bấm `POST /api/tickets/reserve` tối đa 3 lần, chấp nhận `409 Conflict` là hết vé/đụng tranh chấp hợp lệ.
- Người dùng giữ vé thành công sẽ thanh toán giả lập qua `POST /api/tickets/pay` theo tỷ lệ mặc định 85%.
- Threshold kiểm tra latency, lỗi bất thường và không cho phép oversell/tồn kho âm.

Chạy API trước:

```bash
docker compose up -d
dotnet run --project backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

Chạy load test:

```bash
k6 run k6-ticket-rush.js
```

Tùy chỉnh nhanh:

```bash
k6 run -e BASE_URL=http://localhost:5141 -e USERS=5000 -e RUSH_DURATION=60s -e RESERVE_ATTEMPTS=3 -e PAY_RATIO=0.85 k6-ticket-rush.js
```

Nếu máy local không đủ tài nguyên cho 5.000 VU, nên smoke test trước:

```bash
k6 run -e USERS=100 -e RUSH_DURATION=30s k6-ticket-rush.js
```

Nếu chạy test nhiều lần, cần reset database/seed lại tồn kho vì test sẽ thật sự reserve/pay vé.
