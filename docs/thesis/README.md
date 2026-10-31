# Tư liệu cho báo cáo đồ án

Mỗi lần huấn luyện có một thư mục riêng chứa số liệu, bảng và hình, dùng để đưa vào báo cáo.

| Thư mục | Nội dung |
| --- | --- |
| `m2/<run>/README.md` | Tóm tắt số liệu và các hình (sinh tự động) |
| `m2/<run>/NOTES.md` | Nhận xét viết tay: diễn giải, hạn chế, hướng cải thiện |
| `m2/<run>/figures/` | Biểu đồ PNG 200 dpi, chèn thẳng vào Word |
| `m2/<run>/tables/` | Bảng CSV đầy đủ các cột (UTF-8 có BOM, mở được bằng Excel) |
| `m2/<run>/data/` | JSON gốc: thẻ dữ liệu, cấu hình huấn luyện, lịch sử validation, kết quả đánh giá |

## Tạo báo cáo cho một run mới

```powershell
cd ml
.\.venv\Scripts\python.exe scripts\build_m2_report.py --run runs\<tên-run> --data data\m2
```

Checkpoint (`ml/runs/<run>/best.pt`) **không** nằm trong thư mục này và không
được commit vào git, vì file khá nặng. Hãy tự sao lưu nếu cần nộp mô hình.
