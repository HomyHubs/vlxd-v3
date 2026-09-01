# ADR-0001: Web app stack và Vertical Slice

- Trạng thái: Accepted
- Ngày: 2026-08-31

## Bối cảnh

vlxd-v3 cần chứng minh sớm đường đi hoàn chỉnh từ browser qua API tới PostgreSQL, đồng thời giữ contract và module boundary rõ ràng.

## Quyết định

Dùng monorepo pnpm với React/Vite/MUI ở frontend, Fastify/Zod/Kysely ở backend, PostgreSQL/dbmate cho dữ liệu và OpenAPI làm nguồn sự thật API. Triển khai theo Vertical Slice; mỗi slice là một PR và kết thúc bằng hành vi bấm được.

## Hệ quả

- FE không truy cập PostgreSQL/Supabase trực tiếp.
- API client được sinh từ OpenAPI.
- Migration phải reversible.
- Mỗi slice phải đi qua cổng kiểm tra cục bộ và CI.
