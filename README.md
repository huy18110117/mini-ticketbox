# Mini TicketBox

Họ tên: TODO - cập nhật trước khi nộp bài.

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
