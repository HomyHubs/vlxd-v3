# Vertical Slice — Phương pháp triển khai

Tài liệu này chỉ mô tả phương pháp triển khai theo lát cắt dọc. Nó không lưu roadmap, task, trạng thái hoàn thành hoặc phạm vi chi tiết của từng slice.

Nguồn sự thật duy nhất về phạm vi, tiến độ và lịch sử thay đổi là mục **Trạng thái tiến độ** trong [`AGENTS.md`](AGENTS.md).

## Nguyên tắc

- Mỗi slice là một luồng nhỏ nhưng đầy đủ từ giao diện → API → service → database → giao diện.
- Mỗi slice kết thúc bằng một màn hình có thể thao tác được trong browser.
- API phải được định nghĩa contract-first trong `contracts/http/openapi.yaml`; sau đó regenerate API client trước khi triển khai code phụ thuộc.
- Xác thực, phân quyền, giới hạn gói và i18n phải là hành vi thật, không giả lập.
- Mỗi slice được phát triển trong một PR riêng và phải có kiểm thử cho service/API và UI.
- Migration phải reversible; thay đổi phạm vi phải giữ nguyên ID lịch sử và ghi nhận trong `AGENTS.md`.

## Definition of Done

- Luồng chính chạy được qua browser với request thật tới API và dữ liệu thật khi nghiệp vụ có persistence.
- Contract, API client, migration, quyền, giới hạn gói và bản dịch liên quan đã đồng bộ.
- Có kiểm thử phù hợp và các cổng gác của repo đã pass.
- `AGENTS.md` đã được cập nhật trong cùng PR.

## Quy trình thay đổi phạm vi

Trước khi bắt đầu một slice hoặc thay đổi slice đã có, đọc `AGENTS.md`, cập nhật phạm vi và sổ thay đổi ở đó, rồi mới code. Không sửa lại lịch sử đã ship; thay đổi sau khi ship phải dùng ID mới theo quy định trong `AGENTS.md`.
