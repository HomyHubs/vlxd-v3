# Decision Backlog

Không có blocking gate đang mở cho Slice 0.

## Quyết định đã chốt

- 2026-08-31: Web app frontend + backend, monorepo pnpm.
- 2026-08-31: Contract-first OpenAPI; frontend chỉ gọi backend.
- 2026-08-31: PostgreSQL 18, Kysely và dbmate.
- 2026-08-31: Phát triển theo Vertical Slice, một slice trên một PR.

## Câu hỏi đang mở

- Slice 3: giới hạn số kho của gói Free chưa được định nghĩa. Tạm chọn cấu hình `freePlanLimit` với giá trị 3 cho implementation; cần xác nhận trước khi merge.
