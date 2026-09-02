# MVP Backlog — vlxd-v3

Theo dõi theo phương pháp Vertical Slice (không dùng TASK-ID rời rạc kiểu ví dụ TASK-011b — đó chỉ là ví dụ minh hoạ, không áp dụng cho repo này). Mỗi dòng là một slice; không xoá dòng, không đánh số lại khi đổi phạm vi (mục 17, `AGENTS.md`).

| Slice | Mô tả | Trạng thái | PR | Ghi chú |
| --- | --- | --- | --- | --- |
| Slice 0 | Monorepo scaffold + walking skeleton | Xong | #1 (merged) | |
| Slice 1 | Đăng nhập thật: migration tenant/user/session, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, trang `/login` | Xong | #2 (merged) | Stub cố ý: quên mật khẩu, 2FA, mời user — để dành slice sau. |
| Slice 2 | Sản phẩm: xem và tạo — migration `product`/`unit`, API danh sách/tạo sản phẩm, giao diện `/products`, giới hạn gói Free 80 sản phẩm | Xong | #5 (merged) | Agent B round 2 approved; squash-merged vào `dev` tại `07f1476`. |
| Slice 3 | Kho & tồn hiển thị — migration `warehouse`/`stock_level`, API danh sách/tạo kho, giao diện `/warehouses`, tồn ban đầu bằng 0 trên sản phẩm | Đang làm | `feature/slice-3` | Task 3.1–3.3; giới hạn kho Free cần chốt trước khi merge. |

_Thêm slice mới vào cuối bảng khi bắt đầu, không sửa số thứ tự đã cấp._
