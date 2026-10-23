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

Tài liệu PDF tải lên chỉ được xử lý tạm thời trong trình duyệt và không được lưu trên máy chủ. Mục **Tài liệu gần đây** chỉ là danh sách cục bộ trên thiết bị hiện tại.
