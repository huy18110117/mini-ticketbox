# Mini TicketBox

Họ tên: Bùi Đức Huy

Mini TicketBox là ứng dụng fullstack mô phỏng hệ thống mở bán vé concert giới hạn 500 vé cho khoảng 5.000 người dùng truy cập đồng thời. Dự án tập trung giải quyết bài toán giữ vé 5 phút, chống overselling khi nhiều request cùng đặt vé, cập nhật tồn kho realtime và dashboard admin theo dõi doanh thu/hold đang khóa.

## Tech stack

- Backend: ASP.NET Core Web API, .NET 10, EF Core, PostgreSQL, Redis, SignalR.
- Frontend: Angular 19, standalone components, Angular signals, SignalR client.
- Database/cache: PostgreSQL 16 lưu dữ liệu giao dịch, Redis 7 lưu TTL cho hold vé.
- Test/load test: xUnit cho unit test backend, k6 cho kịch bản 5.000 người dùng tranh vé.
- Local infrastructure: Docker Compose chạy PostgreSQL và Redis.

## Yêu cầu môi trường

Cần cài đặt các công cụ sau trước khi chạy project local:

- .NET SDK 10.0 trở lên để build API, chạy backend và chạy unit test.
- Node.js 20 LTS trở lên và npm để cài dependencies/chạy Angular UI.
- Angular CLI 19 trở lên. Project đã có `@angular/cli` trong devDependencies nên có thể chạy qua `npm start`; nếu muốn dùng trực tiếp lệnh `ng`, có thể cài global bằng `npm install -g @angular/cli`.
- Docker Desktop hoặc Docker Engine có Docker Compose v2 để chạy PostgreSQL và Redis bằng `docker compose up -d`.
- k6 nếu muốn chạy load test mô phỏng 5.000 users tranh 500 vé.

Kiểm tra nhanh phiên bản:

```bash
dotnet --version
node --version
npm --version
docker --version
docker compose version
k6 version
```

## Cấu trúc thư mục chính

```text
backend/
  src/
    MiniTicketBox.Api/             # ASP.NET Core API, controllers, middleware, SignalR hub
    MiniTicketBox.Application/     # Contracts, interfaces, realtime abstractions
    MiniTicketBox.Domain/          # Entities, enums, domain logic
    MiniTicketBox.Infrastructure/  # EF Core, PostgreSQL, Redis, services, background jobs
  tests/
    MiniTicketBox.UnitTests/       # Unit tests cho logic cốt lõi
frontend/
  mini-ticketbox-web/              # Angular 19 web app
docker-compose.yml                 # PostgreSQL + Redis
k6-ticket-rush.js                  # Load test 5.000 người dùng tranh 500 vé
```

## Chạy local

### 1. Khởi động hạ tầng PostgreSQL và Redis

```bash
docker compose up -d
```

Docker Compose sẽ mở các service:

- PostgreSQL: `localhost:5432`, database `miniticketbox`, user `postgres`, password `123456`.
- Redis: `localhost:6379`.

### 2. Chạy backend API

```bash
dotnet run --project backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

Khi API start, EF Core sẽ tự chạy migration và seed 500 vé ban đầu:

- VIP: 100 vé.
- Standard: 300 vé.
- Economy: 100 vé.

API mặc định chạy tại `http://localhost:5141`. Swagger bật ở môi trường Development. SignalR hub nằm tại `/hubs/tickets`.

### 3. Chạy frontend Angular

```bash
cd frontend/mini-ticketbox-web
npm install
npm start
```

Mở web tại `http://localhost:4200`.

Các trang chính:

- Trang chủ: `http://localhost:4200/` hiển thị tồn kho realtime.
- Trang đặt vé: `http://localhost:4200/booking` chọn loại vé, giữ vé và thanh toán giả lập.
- Trang admin: `http://localhost:4200/admin` xem vé đã bán, doanh thu và danh sách hold đang khóa.

## API chính

- `GET /api/tickets`: lấy danh sách loại vé, giá vé, tổng vé và vé còn lại.
- `GET /api/tickets/snapshot`: lấy snapshot tồn kho, tổng vé còn, tổng vé đang hold, tổng vé đã bán và doanh thu.
- `GET /api/tickets/admin/dashboard`: lấy dữ liệu dashboard admin và danh sách hold đang active.
- `POST /api/tickets/reserve`: giữ vé trong 5 phút, trả về `holdCode`, `expiredAt`, `serverTimeUtc`.
- `POST /api/tickets/pay`: thanh toán giả lập bằng `holdCode`, tạo order và chuyển hold sang paid.
- `POST /api/tickets/cancel-hold`: hủy hold còn hạn và trả vé về kho.

## Luồng chức năng theo đề bài

- Quản lý kho vé theo loại vé, giá vé, tổng số lượng và số lượng còn lại.
- Khi user bấm chọn vé, backend tạo hold 5 phút; trong thời gian này số lượng vé bị trừ khỏi tồn kho khả dụng nên user khác không thể đặt trùng.
- Nếu user thanh toán thành công, hold được chuyển sang paid và tạo order.
- Nếu user hủy hold hoặc hold hết hạn, hệ thống release vé về lại tồn kho.
- Background service quét hold hết hạn mỗi 30 giây để release vé tự động.
- Frontend có trang chủ realtime, trang booking có countdown 5 phút và trang admin thống kê số vé đã bán/doanh thu/hold đang khóa.

## Giải pháp kỹ thuật chính

### 1. Chống overselling và race condition

- Mỗi request reserve chạy trong database transaction.
- Backend khóa dòng loại vé bằng PostgreSQL `FOR UPDATE` trước khi kiểm tra/trừ `AvailableQuantity`.
- Nếu số vé còn lại không đủ, API trả lỗi conflict thay vì trừ âm tồn kho.
- Luồng payment/cancel cũng khóa dòng hold bằng `FOR UPDATE` để tránh thanh toán/hủy trùng một hold.
- EF Core execution strategy được dùng để retry các lỗi transient khi làm việc với PostgreSQL.

### 2. Hold vé 5 phút và release tự động

- Hold được lưu trong PostgreSQL để đảm bảo tính bền vững dữ liệu.
- Redis lưu key `ticket-hold:{holdCode}` với TTL 5 phút để hỗ trợ cơ chế timeout/cache nhanh.
- Background service `ExpiredTicketHoldBackgroundService` quét định kỳ các hold hết hạn, chuyển trạng thái sang released và cộng lại số vé vào `AvailableQuantity`.

### 3. Realtime inventory

- SignalR broadcast event `inventoryChanged` sau các thao tác reserve, payment, cancel/release.
- Frontend và admin dashboard nhận snapshot mới để cập nhật số vé còn lại theo thời gian thực, giảm nhu cầu F5 liên tục.

### 4. Frontend UX dưới tải cao

- Nút đặt vé/thanh toán được disable khi request đang xử lý để chặn spam click.
- UI hiển thị trạng thái loading/error khi API chậm hoặc trả lỗi conflict/hết vé.
- Countdown lấy mốc `expiredAt` và `serverTimeUtc` từ backend để hạn chế lệch giờ client.
- Khi có realtime event, các trang tự đồng bộ lại inventory/admin snapshot.

### 5. Clean code và xử lý lỗi

- Tách lớp rõ ràng theo Domain/Application/Infrastructure/API.
- Domain entity chứa logic như reserve/release/mark paid.
- API dùng controller mỏng, gọi service qua interface.
- Global exception middleware chuẩn hóa lỗi `400 Bad Request`, `409 Conflict`, `500 Internal Server Error`.
- Request/response contracts tách riêng để API rõ ràng và dễ test.

## Kiểm thử và build

Chạy backend unit tests:

```bash
dotnet test backend/tests/MiniTicketBox.UnitTests/MiniTicketBox.UnitTests.csproj
```

Build backend API:

```bash
dotnet build backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

Build frontend Angular:

```bash
cd frontend/mini-ticketbox-web
npm run build
```

Kết quả kiểm tra hiện tại: backend tests pass, API build pass, Angular build pass.

## Load test k6: 5.000 người dùng cùng giành vé

Kịch bản `k6-ticket-rush.js` dùng để chứng minh yêu cầu: 5.000 người dùng cùng vào giành giật 500 vé, có thể F5 liên tục để xem tồn kho và bấm đặt vé gần như cùng một thời điểm nhưng hệ thống vẫn không oversell, không trừ âm tồn kho và không bán vượt quá 500 vé.

Các điểm chính của kịch bản:

- Mặc định chạy 5.000 VU với 5.000 iterations, tương ứng 5.000 người dùng cùng tham gia đợt mở bán trong tối đa 60 giây.
- Mỗi user gọi `POST /api/tickets/reserve` tối đa 3 lần như hành vi bấm đặt vé/tranh vé cùng lúc.
- Backend dùng transaction và khóa dòng PostgreSQL `FOR UPDATE`, nên dù nhiều request reserve đến đồng thời, chỉ các request còn đủ vé mới giữ vé thành công; các request đến sau khi hết vé nhận `409 Conflict` hợp lệ.
- Script cấu hình `expectedStatuses` để `409 Conflict` của reserve được xem là kết quả nghiệp vụ hợp lệ, không bị tính nhầm là lỗi hệ thống trong `http_req_failed`.
- Người dùng giữ vé thành công sẽ thanh toán giả lập qua `POST /api/tickets/pay` theo tỷ lệ mặc định 85%.
- Threshold kiểm tra latency, lỗi bất thường và đặc biệt là `oversell_detected == 0` để đảm bảo không có tồn kho âm/overselling.

Về hành vi F5/snapshot:

- Hệ thống vẫn đáp ứng trường hợp 5.000 người dùng F5 liên tục vì `GET /api/tickets/snapshot` là endpoint đọc trạng thái tồn kho, không thay đổi dữ liệu bán vé.
- Tuy nhiên trong thực tế frontend nhận cập nhật tồn kho realtime qua SignalR, nên không cần spam snapshot hàng chục nghìn lần.
- Vì vậy script mặc định chỉ lấy mẫu snapshot 5% (`SNAPSHOT_SAMPLE_RATE=0.05`) để số liệu latency của reserve/payment không bị nhiễu bởi tải đọc thống kê nhân tạo.
- Nếu muốn test đúng kiểu F5 storm, có thể đặt `SNAPSHOT_SAMPLE_RATE=1` để mọi VU đều gọi snapshot trước khi đặt vé. Khi đó snapshot p95 cao phản ánh endpoint thống kê/ticket list đang bị bắn mạnh, không đồng nghĩa với lỗi oversell hay lỗi reserve.

Chạy API trước:

```bash
docker compose up -d
dotnet run --project backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

Chạy load test mặc định:

```bash
k6 run k6-ticket-rush.js
```

Tùy chỉnh nhanh:

```bash
k6 run -e BASE_URL=http://localhost:5141 -e USERS=5000 -e ITERATIONS=5000 -e RUSH_DURATION=60s -e SNAPSHOT_SAMPLE_RATE=0.05 -e RESERVE_ATTEMPTS=3 -e PAY_RATIO=0.85 k6-ticket-rush.js
```

Chạy chế độ F5 storm, mỗi user đều gọi snapshot trước khi bấm đặt vé:

```bash
k6 run -e BASE_URL=http://localhost:5141 -e USERS=5000 -e ITERATIONS=5000 -e RUSH_DURATION=60s -e SNAPSHOT_SAMPLE_RATE=1 -e RESERVE_ATTEMPTS=3 -e PAY_RATIO=0.85 k6-ticket-rush.js
```

Nếu muốn smoke test nhẹ hơn:

```bash
k6 run -e USERS=50 -e ITERATIONS=100 -e RUSH_DURATION=30s k6-ticket-rush.js
```

Khi đọc kết quả phần lớn `409 Conflict` sau khi hết 500 vé là kết quả nghiệp vụ hợp lệ, không phải lỗi hệ thống. Nếu tăng `SNAPSHOT_SAMPLE_RATE` lên cao hoặc gọi snapshot liên tục như F5 storm, latency p95 của snapshot sẽ phản ánh tải thống kê/ticket list nhân tạo; tiêu chí quan trọng nhất của bài toán tranh vé vẫn là reserve/payment không lỗi bất thường và không oversell.

Lưu ý: nếu chạy load test nhiều lần, cần reset database/seed lại tồn kho vì test sẽ thật sự reserve/pay vé.

## Reset dữ liệu local

Cách nhanh nhất để reset lại PostgreSQL volume và seed lại 500 vé ban đầu:

```bash
docker compose down -v
docker compose up -d
dotnet run --project backend/src/MiniTicketBox.Api/MiniTicketBox.Api.csproj
```

## Ghi chú nộp bài

README này đã bao gồm các nội dung theo yêu cầu: hướng dẫn chạy local bằng Docker, tech stack, giải thích kiến trúc, giải pháp chống overselling/concurrency, realtime UX, clean code, unit test và load test.
