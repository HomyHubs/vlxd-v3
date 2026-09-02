# Slice 3 — Task Checklist

- [ ] 3.1 — Migration `warehouses`, `stock_levels`, DB types và rollback test.
  - Acceptance: schema reversible; tồn theo product × warehouse; ràng buộc tenant và quantity hợp lệ.
  - Verify: PostgreSQL integration test và migration rollback.
  - Files: `db/migrations/`, `apps/api/src/platform/database.ts`, API integration tests.
- [ ] 3.2 — Contract/API `GET /warehouses`, `POST /warehouses` và giới hạn kho theo gói.
  - Acceptance: auth + tenant isolation; duplicate code có error code; vượt limit bị chặn; OpenAPI/client/shared đồng bộ.
  - Verify: API unit/integration tests, `pnpm contracts:check`.
  - Files: `contracts/http/openapi.yaml`, `packages/shared/`, `packages/api-client/`, `apps/api/src/features/warehouses/`.
- [ ] 3.3 — UI `/warehouses` và tồn kho trên `/products`.
  - Acceptance: tạo kho bằng dialog; danh sách kho refresh; product list hiển thị tồn theo kho bằng 0; vi/en đầy đủ.
  - Verify: component tests, manual browser check với API thật.
  - Files: `apps/web/src/features/warehouses/`, `apps/web/src/features/products/`, locales.

## Dependency order

`3.1 → 3.2 → 3.3`; không triển khai song song phần migration và API contract.

Implementation status (2026-09-02): 3.1 and 3.2 complete; 3.3 is next.
