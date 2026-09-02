# vlxd-v3

Web app quản lý cửa hàng vật liệu xây dựng, phát triển theo Vertical Slice.

## Slice hiện tại

**Slice 0 — Walking skeleton:** Browser → Fastify API → PostgreSQL → Browser.

## Chạy local

```bash
docker compose -f compose.dev.yml up --build
```

Mở `http://localhost:5173`, bấm **Kiểm tra hệ thống** và kỳ vọng thấy **Hệ thống hoạt động bình thường**.

## Cổng kiểm tra

```bash
corepack enable
pnpm install
pnpm contracts:generate
pnpm check
```

Đọc `AGENTS.md` và `docs/README.md` trước khi thay đổi source.
