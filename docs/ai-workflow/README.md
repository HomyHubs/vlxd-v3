# Quy trình AI Workflow — vlxd-v3

Tài liệu này mô tả cơ chế để các phiên làm việc AI (Codex, ChatGPT, agent khác) lưu vết tiến độ giữa các phiên: đang làm gì, tới đâu, phần nào chưa làm, phần nào sẽ làm tiếp theo.

## Thứ tự đọc khi bắt đầu phiên

1. `AGENTS.md` ở gốc repo — quy tắc vận hành và mục "Trạng thái tiến độ" (nguồn sự thật duy nhất cho tiến độ toàn dự án).
2. Tài liệu này — quy trình ghi log thực thi/review.
3. `docs/tasks/CURRENT.md` — task đang được giao xử lý (nếu có).
4. `docs/tasks/MVP-BACKLOG.md` — danh sách đầy đủ các task, trạng thái từng task.

## Vòng đời một task

1. Task được thêm vào `docs/tasks/MVP-BACKLOG.md` với ID bất biến (không đánh số lại, không xoá dòng — theo mục 17 của `AGENTS.md`).
2. Khi bắt đầu xử lý, cập nhật `docs/tasks/CURRENT.md` trỏ tới ID task đang làm.
3. Trong lúc làm: ghi execution log theo template `execution-log-template.md`, một file log mới cho mỗi phiên, đặt trong `docs/ai-workflow/execution-logs/<TASK-ID>-<yyyy-mm-dd>.md`.
4. Trước khi mở PR: chạy cổng gác thực tế trong mục 4 của `AGENTS.md` (`pnpm check` và `pnpm contracts:check`). PASS mới commit.
5. Sau khi có PR: ghi review log theo template `review-log-template.md`, đặt trong `docs/ai-workflow/review-logs/<TASK-ID>-round-<n>.md`.
6. Khi task xong: cập nhật trạng thái trong `MVP-BACKLOG.md` (mục 17.4 của `AGENTS.md`), cập nhật `AGENTS.md` mục "Trạng thái tiến độ", và cập nhật `CURRENT.md` sang task tiếp theo (hoặc để trống nếu chưa chọn task mới).

## Quy tắc bàn giao giữa phiên

- Nếu hết token / dừng giữa chừng: ghi rõ vào execution log đang viết dở phần nào, và cập nhật `docs/tasks/CURRENT.md` với mục "Đang làm dở" + "Bước tiếp theo".
- Phiên kế tiếp CHỈ cần đọc `AGENTS.md` + tài liệu này + `docs/tasks/CURRENT.md` là đủ để tiếp tục, không cần hỏi lại người dùng.

## Chiến lược nhánh (branch strategy)

- Mọi slice làm trên nhánh riêng và mở PR với **base = `dev`**. Không mở PR thẳng vào `main`.
- `main` là nhánh release cho khách hàng: chủ repo tự tay đẩy `dev` → `main` khi cần release. AI agent/Codex không tự mở PR hoặc merge vào `main`.
