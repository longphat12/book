# Đọc tập trung

Đọc đến đâu, theo sát từng từ đến đó — giữ mạch đọc liền mạch, không bỏ sót dòng nào.

## Mở tài liệu PDF

Tải tài liệu từ máy tính để bắt đầu đọc. Hệ thống tự động phân tích cấu trúc, trích xuất văn bản và chuẩn bị trải nghiệm đọc tuần tự bằng phím mũi tên trái, phải.

### Hướng dẫn sử dụng

1. Chạy server trong thư mục:
   ```bash
   python3 server.py
   ```
2. Mở trình duyệt tại `http://localhost:8000`.
3. Bấm nút **"Tải PDF lên"** hoặc kéo thả file PDF vào giao diện.
4. Trình đọc sẽ tự động mở:
   - Cột bên trái hiển thị **% tiến độ**, thống kê trang, từ và toàn bộ công cụ điều khiển.
   - Giữ phím mũi tên `←` / `→` để di chuyển và bôi vàng tuần tự từng từ.

Tài liệu PDF tải lên được lưu trên máy chủ và hiển thị công khai trong mục **Tài liệu gần đây** cho mọi người cùng mở đọc. Kho lưu trữ tối đa **50 GB**; khi vượt giới hạn, hệ thống tự động xóa các tài liệu cũ nhất trước khi lưu tài liệu mới.

### Chạy production bằng Docker

```bash
docker compose up -d --build
```

Container tự build giao diện, chạy API và giữ dữ liệu PDF trong volume `book-data`. Domain cần reverse proxy về port `8000`.

### Chạy production bằng PM2

```bash
npm run build
sudo mkdir -p /var/lib/book/documents
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

PM2 phải chạy `server.py`, không chạy `python3 -m http.server` hoặc chỉ chạy thư mục `dist`; nếu không API lưu PDF sẽ không hoạt động. Sau mỗi lần cập nhật code, chạy `npm run build && pm2 restart book-reader`.
