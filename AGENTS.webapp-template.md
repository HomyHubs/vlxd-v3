# AGENTS.md — Web App Template (Frontend + Backend)

> Chỉ dẫn vận hành cho AI Coding Agent khi khởi tạo hoặc phát triển một web app mới.
> Được rút ra từ thực tế repo `HomyHubs/ftrack` (branch `dev`) và bổ sung các cải tiến.
> Đặt file này ở **root repo**. Mỗi package/feature có thể có `AGENTS.md` lồng nhau bổ sung.

---

## 0. Nguyên tắc bất biến (đọc trước khi làm bất cứ việc gì)

1. **Memory nằm trong file, không nằm trong context.** Mọi trạng thái, quyết định, tiến độ phải ghi vào `AGENTS.md` / `docs/` / ADR — không giữ trong bộ nhớ hội thoại.
2. **Inspect trước khi assume.** Không giả định tồn tại service, biến môi trường, script, API hay bảng DB. Đọc repo trước.
3. **Contract-first.** `contracts/http/openapi.yaml` là nguồn sự thật duy nhất của API. Code FE/BE phải khớp spec; CI có gate chống drift.
4. **Không refactor ngoài phạm vi task.** Thay đổi nhỏ, commit rõ ràng, một mục đích một commit.
5. **Feature encapsulation.** Cross-module import chỉ qua public entry point (`index.ts`). Enforce bằng `eslint-plugin-boundaries`.
6. **Không có secret trong repo**, image, log, fixture hay tài liệu. Secret đi qua secret manager.
7. **Mọi lệnh dev/test chạy qua Docker Compose**, không phụ thuộc runtime cài trên host.
8. **Cập nhật tiến độ** trong `AGENTS.md` của module tương ứng sau mỗi task.

---

## 1. Tech stack chuẩn

### Backend (`apps/api`)

| Hạng mục        | Lựa chọn                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| Ngôn ngữ        | TypeScript 5.9+, ESM (`"type": "module"`)                                       |
| Runtime         | Node 24.x (pin đúng 1 version cho toàn repo qua `.nvmrc`)                       |
| Package manager | pnpm 11.x + pnpm workspace                                                      |
| HTTP framework  | Fastify 5 + `fastify-type-provider-zod`                                         |
| Database        | PostgreSQL 18.x                                                                 |
| Data access     | Kysely (query builder type-safe) trên `pg`                                      |
| Migration       | dbmate (SQL thuần, reversible)                                                  |
| Validation      | Zod 4 (dùng chung FE/BE qua `packages/shared`)                                  |
| Auth            | Opaque server-side session + capability-based authorization; `jose` khi cần JWS |
| Logging         | pino (bật redact PII) + request-id                                              |
| Tracing/Metrics | OpenTelemetry, endpoint `/healthz` và `/readyz`                                 |
| Security        | `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`                       |
| Test            | Vitest 4 (project `unit` + `integration`), testcontainers cho DB thật           |
| Chất lượng      | ESLint 9 + typescript-eslint, Prettier, `pnpm check` gộp tất cả                 |

### Frontend (`apps/web`)

| Hạng mục     | Lựa chọn                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------- |
| Framework    | React 19 + TypeScript + Vite                                                             |
| UI           | MUI v6+ (`@emotion`), `@mui/x-date-pickers`, `material-react-table`                      |
| Server state | TanStack React Query 5                                                                   |
| Form         | react-hook-form + `@hookform/resolvers` + Zod                                            |
| Router       | react-router-dom 7 (route-level lazy loading)                                            |
| i18n         | i18next + react-i18next (không hardcode chuỗi UI)                                        |
| Date         | dayjs                                                                                    |
| API client   | Sinh tự động từ OpenAPI vào `packages/api-client` (openapi-typescript / orval / kubb)    |
| Test         | Vitest + Testing Library; Playwright + `@axe-core/playwright` cho E2E & a11y             |
| Mock API     | MSW                                                                                      |
| Gate         | coverage v8, bundle budget (`scripts/check-bundle-budget.mjs`), `eslint-plugin-jsx-a11y` |

### Hạ tầng & CI/CD

| Hạng mục            | Lựa chọn                                                                        |
| ------------------- | ------------------------------------------------------------------------------- |
| Local orchestration | `compose.dev.yml` (web, api, db, migrate, verify profiles)                      |
| Môi trường          | `compose.dev / staging / production / ci.yml`                                   |
| Reverse proxy       | nginx                                                                           |
| IaC                 | Terraform (`infra/`) với remote state; `terraform plan` bắt buộc trong PR       |
| Deploy target       | Cloud Run + Cloud SQL (ưu tiên) — single-VM chỉ cho prototype                   |
| CI                  | **Một** pipeline GitHub Actions duy nhất; cache pnpm store + turbo remote cache |
| Secret              | GCP Secret Manager (không dùng `.env` cho staging/prod)                         |
| Supply chain        | Renovate (auto-merge patch), `pnpm audit`, gitleaks trong CI                    |

---

## 2. Cấu trúc repo chuẩn

```text
repo/
├── AGENTS.md                     # file này
├── Makefile                      # make bootstrap | dev | check | migrate
├── turbo.json                    # task graph + cache
├── pnpm-workspace.yaml
├── .nvmrc                        # 1 phiên bản Node duy nhất
├── docs/
│   ├── README.md                 # cổng vào tài liệu hệ thống
│   ├── decision-backlog.md       # các gate còn mở, không được vượt
│   ├── adr/                      # ADR-0001.md ... (Accepted = immutable)
│   ├── architecture/
│   └── business-analysis/
├── standards/                    # guidance tái sử dụng, portable
│   ├── README.md
│   ├── engineering-practices/
│   └── standards-governance.md
├── contracts/
│   └── http/openapi.yaml         # single source of truth cho API
├── apps/
│   ├── web/    (+ AGENTS.md)     # React + Vite
│   │   └── src/{app,features,components,lib,i18n,theme,utils,test,generated}
│   └── api/    (+ AGENTS.md)     # Fastify
│       └── src/{features,platform,main.ts}
├── packages/
│   ├── shared/                   # Zod schemas, domain types, error codes
│   ├── api-client/               # generated từ OpenAPI (không sửa tay)
│   ├── config-eslint/
│   ├── config-ts/
│   └── config-prettier/
├── db/         (+ AGENTS.md)     # migrations, seeds, roles, integration tests
├── e2e/                          # Playwright
├── infra/                        # Terraform
├── nginx/
└── compose.*.yml
```

### Quy ước vertical slice

Mỗi feature là một slice hoàn chỉnh, không import chéo vào nội thất của slice khác:

```text
apps/api/src/features/claim/
├── index.ts        # public entry point — chỉ export những gì bên ngoài được dùng
├── routes.ts       # HTTP layer (khớp openapi.yaml)
├── service.ts      # domain logic, không biết HTTP
├── repository.ts   # Kysely queries, không biết HTTP
├── schema.ts       # Zod (re-export từ packages/shared nếu dùng chung với FE)
└── __tests__/
```

```text
apps/web/src/features/claim/
├── index.ts        # public entry point (routes + component export)
├── api/            # hooks React Query bọc api-client
├── components/
├── pages/
├── hooks/
└── __tests__/
```

---

## 3. Workflow bắt buộc cho AI Agent

### Trước khi code

1. Đọc `docs/README.md`, `standards/README.md` và `AGENTS.md` lồng nhau của thư mục sẽ sửa.
2. Đọc `docs/decision-backlog.md`. **Không được vượt qua một blocking gate đã đặt tên.**
3. Xác minh requirement/contract đã được chấp nhận. Test không tự cấp phép cho một hành vi sản phẩm được giả định.
4. Nếu là thay đổi API: sửa `contracts/http/openapi.yaml` **trước**, rồi regenerate client.
5. Nếu là thay đổi schema DB: viết migration dbmate mới, không sửa migration đã merge.

### Khi code

- Component/feature mới → tạo slice đầy đủ theo mẫu ở mục 2.
- Chỉ import qua `index.ts` của module khác.
- Mọi input từ ngoài (HTTP body, query, env) đều parse bằng Zod.
- Mọi chuỗi UI đi qua i18next.
- Không thêm dependency mới mà không ghi lý do vào PR description.

### Trước khi commit

```bash
make check      # = pnpm -r check: format:check && lint && dependencies:check && typecheck && test && build
```

Gate phải xanh: format, lint (`--max-warnings 0`), typecheck, unit + integration test, OpenAPI drift, bundle budget, secret scan.

### Sau khi code

1. Cập nhật standard/tài liệu sở hữu rule đó (không nhân bản rule portable vào docs dự án).
2. Thêm ADR mới nếu quyết định mang tính cross-cutting hoặc khó đảo ngược.
   **Không sửa ADR đã Accepted/Rejected** — tạo ADR tuần tự mới và cập nhật index.
3. Cập nhật trạng thái tiến độ trong `AGENTS.md` của module.
4. Commit nhỏ, message theo Conventional Commits: `feat(claim): ...`, `fix(api): ...`, `docs(adr): ...`.

---

## 4. Lệnh chuẩn

```bash
# Khởi tạo lần đầu
make bootstrap                       # cài deps + build image + migrate + seed

# Phát triển
docker compose -f compose.dev.yml up            # web + api + db
docker compose -f compose.dev.yml run --rm migrate

# Kiểm tra
pnpm -r check
pnpm --filter api test:integration
pnpm --filter web test:browser-integration       # Playwright
pnpm --filter web test:bundle-budget

# Contract
pnpm contracts:lint
pnpm contracts:generate     # sinh packages/api-client — commit kết quả
pnpm contracts:check        # gate drift, phải chạy trong CI
```

---

## 5. Definition of Done

Một task chỉ được coi là xong khi đủ **tất cả**:

- [ ] Hành vi khớp OpenAPI spec đã cập nhật; client đã regenerate và commit
- [ ] Có unit test cho domain logic và integration test cho đường đi qua DB thật
- [ ] `pnpm -r check` xanh cục bộ và trên CI
- [ ] Không thêm secret, không thêm `any`, không thêm eslint-disable không có comment lý do
- [ ] Chuỗi UI đã i18n; component mới đạt a11y (axe không có violation mới)
- [ ] Log có structured field + request-id; lỗi trả về theo error code trong `packages/shared`
- [ ] Tài liệu/ADR/tiến độ đã cập nhật
- [ ] Migration reversible và đã test rollback

---

## 6. Anti-pattern cần tránh

| Anti-pattern                                      | Thay bằng                                             |
| ------------------------------------------------- | ----------------------------------------------------- |
| Pin cứng tuyệt đối mọi dependency rồi để mục      | Lockfile là nguồn sự thật + Renovate auto-merge patch |
| Node version lệch giữa FE và BE                   | Một `.nvmrc` duy nhất cho cả repo                     |
| Copy type/schema giữa FE và BE                    | `packages/shared` + client sinh từ OpenAPI            |
| Sửa tay code trong `generated/`                   | Sửa `openapi.yaml` rồi regenerate                     |
| Hai pipeline CI song song (Actions + Cloud Build) | Một pipeline GitHub Actions                           |
| Deploy single-VM cho sản phẩm cần scale           | Cloud Run + Cloud SQL, blue/green                     |
| `.env` chứa secret ở staging/prod                 | Secret Manager, inject lúc runtime                    |
| Không có observability                            | pino + OpenTelemetry + Sentry ngay từ ngày 1          |
| Test viết để mô tả hành vi tự giả định            | Xác minh contract/requirement trước khi viết test     |
| Refactor lớn kèm feature                          | Tách PR riêng                                         |

---

## 7. Trạng thái hiện tại (agent cập nhật mục này)

```text
- [ ] Monorepo skeleton (pnpm workspace + turbo)
- [ ] contracts/http/openapi.yaml khởi tạo
- [ ] apps/api: Fastify bootstrap + /healthz
- [ ] apps/web: Vite + MUI + Router bootstrap
- [ ] db: migration đầu tiên + seed
- [ ] compose.dev.yml chạy được end-to-end
- [ ] CI: check + contracts:check + gitleaks
- [ ] infra: Terraform Cloud Run + Cloud SQL
- [ ] Observability: pino + OTel + healthcheck
- [ ] e2e: Playwright smoke test
```

> Cập nhật checklist trên sau mỗi task. Đây là memory của dự án.
