# Web App Template — Chỉ dẫn vận hành cho AI Coding Agent

<aside>
🔗

Trang này là **profile công nghệ bổ sung theo loại app triển khai**, không phải tài liệu gốc. Tài liệu gốc là [AGENTS — Chỉ dẫn vận hành cho AI Coding Agent (GỐC)](https://app.notion.com/p/AGENTS-Ch-d-n-v-n-h-nh-cho-AI-Coding-Agent-G-C-f63e9bfe52014df887d49c55ed4fc2bf?pvs=21). Khi hai tài liệu xung đột, tài liệu gốc thắng. Trước khi tạo dự án mới, phải xác định app cần triển khai là **Web App**, **Desktop App** hay **Mobile App** để chọn đúng frontend, backend và database.

</aside>

<aside>
📦

File `AGENTS.md` sẵn sàng cho AI coding agent, rút ra từ repo `HomyHubs/ftrack` (branch `dev`) và bổ sung cải tiến. Tải file bên dưới, ghép vào `AGENTS.md` gốc ở **root repo** của dự án mới.

</aside>

[[AGENTS.webapp-template.md](http://AGENTS.webapp-template.md)](AGENTS.webapp-template.md)

[AGENTS.webapp-template.md](http://AGENTS.webapp-template.md)

---

## 0. Nguyên tắc bất biến

1. **Memory nằm trong file, không nằm trong context.** Mọi trạng thái, quyết định, tiến độ ghi vào `AGENTS.md` / `docs/` / ADR.
2. **Inspect trước khi assume.** Không giả định tồn tại service, biến môi trường, script, API hay bảng DB.
3. **Contract-first.** `contracts/http/openapi.yaml` là nguồn sự thật duy nhất của API; CI có gate chống drift.
4. **Không refactor ngoài phạm vi task.** Thay đổi nhỏ, một mục đích một commit.
5. **Feature encapsulation.** Cross-module import chỉ qua public entry point `index.ts`, enforce bằng `eslint-plugin-boundaries`.
6. **Không có secret trong repo**, image, log, fixture hay tài liệu.
7. **Mọi lệnh dev/test chạy qua Docker Compose**, không phụ thuộc runtime cài trên host.
8. **Cập nhật tiến độ** trong `AGENTS.md` của module sau mỗi task.

---

## 1. Chọn loại app triển khai trước khi chọn công nghệ

Khi user yêu cầu tạo app, AI agent phải hỏi hoặc xác nhận rõ loại app cần triển khai:

- **Web App**: chạy trên trình duyệt.
- **Desktop App**: chạy thành app cài trên máy tính.
- **Mobile App**: chạy trên điện thoại iOS / Android.

Không được mặc định mọi dự án là web app. Mỗi loại app có frontend, backend và database khác nhau về vị trí chạy.

| Loại app    | Frontend chạy ở đâu?              | Backend chạy ở đâu?                     | Database nằm ở đâu?               |
| ----------- | --------------------------------- | --------------------------------------- | --------------------------------- |
| Web App     | Trình duyệt: Chrome, Safari, Edge | Server / Cloud                          | Cloud database                    |
| Desktop App | Cửa sổ app trên máy tính          | Local trong app hoặc Server / Cloud     | SQLite local hoặc Cloud database  |
| Mobile App  | App trên điện thoại               | Local nhẹ trong app hoặc Server / Cloud | Local storage hoặc Cloud database |

### Stack công nghệ khuyến nghị theo loại app

| Loại app    | Frontend                               | Backend                           | Database            |
| ----------- | -------------------------------------- | --------------------------------- | ------------------- |
| Web App     | React + Vite + TypeScript              | Hono / Fastify + TypeScript       | Supabase PostgreSQL |
| Desktop App | Tauri + React hoặc Svelte + TypeScript | Tauri commands / Rust local logic | SQLite local        |
| Mobile App  | React Native + Expo + TypeScript       | Hono / Fastify + TypeScript       | Supabase PostgreSQL |

**Ghi chú quan trọng:** Supabase không thay thế hoàn toàn backend. Supabase nên được hiểu là dịch vụ hỗ trợ database, auth, storage và realtime. Backend vẫn là nơi viết logic nghiệp vụ: kiểm tra quyền, xử lý đơn hàng, gọi AI, xử lý thanh toán, đồng bộ dữ liệu và điều phối workflow.

Luồng đúng:

```
Frontend → Backend logic → Database / Supabase PostgreSQL
```

Không nên mô tả đơn giản thành:

```
Frontend → Supabase
```

trừ khi app rất nhỏ và cố ý dùng Supabase trực tiếp như Backend-as-a-Service.

### Khi user yêu cầu tạo app

AI agent phải xác định loại app trước, rồi mới dựng cấu trúc repo:

```
User yêu cầu tạo app
→ Xác định: Web App / Desktop App / Mobile App
→ Chọn stack tương ứng
→ Tạo vertical slice đầu tiên
→ Có demo sớm
```

Ưu tiên **vertical slice** thay vì horizontal slice:

```
Frontend nhỏ → Backend logic tối thiểu → Database tối thiểu → Demo chạy được
```

## 2. Tech stack chuẩn cho Web App

Áp dụng phần này khi dự án được xác định là **Web App** có frontend và backend.

### Backend — `apps/api`

| Hạng mục        | Lựa chọn                                                    |
| --------------- | ----------------------------------------------------------- |
| Ngôn ngữ        | TypeScript 5.9+, ESM                                        |
| Runtime         | Node 24.x, pin 1 version cho toàn repo qua `.nvmrc`         |
| Package manager | pnpm 11.x + pnpm workspace                                  |
| HTTP framework  | Fastify 5 + `fastify-type-provider-zod`                     |
| Database        | PostgreSQL 18.x                                             |
| Data access     | Kysely trên `pg`                                            |
| Migration       | dbmate, SQL thuần, reversible                               |
| Validation      | Zod 4 dùng chung qua `packages/shared`                      |
| Auth            | Opaque server-side session + capability-based authorization |
| Logging         | pino, bật redact PII, kèm request-id                        |
| Observability   | OpenTelemetry, endpoint `/healthz` và `/readyz`             |
| Security        | helmet, rate-limit, cors                                    |
| Test            | Vitest 4, testcontainers cho DB thật                        |

### Frontend — `apps/web`

| Hạng mục     | Lựa chọn                                          |
| ------------ | ------------------------------------------------- |
| Framework    | React 19 + TypeScript + Vite                      |
| UI           | MUI v6+, x-date-pickers, material-react-table     |
| Server state | TanStack React Query 5                            |
| Form         | react-hook-form + Zod resolver                    |
| Router       | react-router-dom 7 với route-level lazy loading   |
| i18n         | i18next + react-i18next                           |
| API client   | Sinh tự động từ OpenAPI vào `packages/api-client` |
| Test         | Vitest + Testing Library, Playwright + axe-core   |
| Mock API     | MSW                                               |
| Gate         | coverage v8, bundle budget, jsx-a11y              |

### Hạ tầng và CI/CD

| Hạng mục            | Lựa chọn                                                      |
| ------------------- | ------------------------------------------------------------- |
| Local orchestration | `compose.dev.yml` gồm web, api, db, migrate, verify           |
| Môi trường          | [compose.dev](http://compose.dev) / staging / production / ci |
| Reverse proxy       | nginx                                                         |
| IaC                 | Terraform với remote state, plan bắt buộc trong PR            |
| Deploy              | Cloud Run + Cloud SQL, single-VM chỉ cho prototype            |
| CI                  | Một pipeline GitHub Actions, cache pnpm + turbo remote cache  |
| Secret              | GCP Secret Manager                                            |
| Supply chain        | Renovate, pnpm audit, gitleaks                                |

---

## 2. Cấu trúc repo chuẩn

```
repo/
├── AGENTS.md
├── Makefile                     # bootstrap | dev | check | migrate
├── turbo.json
├── pnpm-workspace.yaml
├── .nvmrc
├── docs/
│   ├── README.md
│   ├── decision-backlog.md
│   ├── adr/
│   ├── architecture/
│   └── business-analysis/
├── standards/
│   ├── engineering-practices/
│   └── standards-governance.md
├── contracts/http/openapi.yaml
├── apps/
│   ├── web/    (+ AGENTS.md)
│   │   └── src/{app,features,components,lib,i18n,theme,utils,test,generated}
│   └── api/    (+ AGENTS.md)
│       └── src/{features,platform,main.ts}
├── packages/
│   ├── shared/          # Zod schemas, domain types, error codes
│   ├── api-client/      # generated, không sửa tay
│   ├── config-eslint/
│   ├── config-ts/
│   └── config-prettier/
├── db/         (+ AGENTS.md)
├── e2e/
├── infra/
├── nginx/
└── compose.*.yml
```

### Quy ước vertical slice

```
apps/api/src/features/claim/
├── index.ts        # public entry point
├── routes.ts       # HTTP layer, khớp openapi.yaml
├── service.ts      # domain logic, không biết HTTP
├── repository.ts   # Kysely queries
├── schema.ts       # Zod
└── __tests__/

apps/web/src/features/claim/
├── index.ts
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
2. Đọc `docs/decision-backlog.md`. Không được vượt qua một blocking gate đã đặt tên.
3. Xác minh requirement hoặc contract đã được chấp nhận. Test không tự cấp phép cho hành vi sản phẩm được giả định.
4. Nếu là thay đổi API: sửa `contracts/http/openapi.yaml` trước, rồi regenerate client.
5. Nếu là thay đổi schema DB: viết migration dbmate mới, không sửa migration đã merge.

### Khi code

- Feature mới tạo slice đầy đủ theo mẫu ở mục 2.
- Chỉ import qua `index.ts` của module khác.
- Mọi input từ ngoài (HTTP body, query, env) đều parse bằng Zod.
- Mọi chuỗi UI đi qua i18next.
- Không thêm dependency mới mà không ghi lý do vào PR description.

### Trước khi commit

```bash
make check   # format:check && lint && dependencies:check && typecheck && test && build
```

Gate phải xanh: format, lint (--max-warnings 0), typecheck, unit + integration test, OpenAPI drift, bundle budget, secret scan.

### Sau khi code

1. Cập nhật standard hoặc tài liệu sở hữu rule đó, không nhân bản rule portable vào docs dự án.
2. Thêm ADR mới nếu quyết định mang tính cross-cutting hoặc khó đảo ngược. Không sửa ADR đã Accepted hoặc Rejected, tạo ADR tuần tự mới và cập nhật index.
3. Cập nhật trạng thái tiến độ trong `AGENTS.md` của module.
4. Commit nhỏ theo Conventional Commits.

---

## 4. Lệnh chuẩn

```bash
# Khởi tạo lần đầu
make bootstrap

# Phát triển
docker compose -f compose.dev.yml up
docker compose -f compose.dev.yml run --rm migrate

# Kiểm tra
pnpm -r check
pnpm --filter api test:integration
pnpm --filter web test:browser-integration
pnpm --filter web test:bundle-budget

# Contract
pnpm contracts:lint
pnpm contracts:generate
pnpm contracts:check
```

---

## 5. Definition of Done

- [ ] Hành vi khớp OpenAPI spec đã cập nhật, client đã regenerate và commit
- [ ] Có unit test cho domain logic và integration test qua DB thật
- [ ] `pnpm -r check` xanh cục bộ và trên CI
- [ ] Không thêm secret, không thêm `any`, không thêm eslint-disable thiếu lý do
- [ ] Chuỗi UI đã i18n, component mới không tạo violation axe mới
- [ ] Log có structured field và request-id, lỗi trả về theo error code trong `packages/shared`
- [ ] Tài liệu, ADR, tiến độ đã cập nhật
- [ ] Migration reversible và đã test rollback

---

## 6. Anti-pattern cần tránh

| Anti-pattern                                 | Thay bằng                                             |
| -------------------------------------------- | ----------------------------------------------------- |
| Pin cứng tuyệt đối mọi dependency rồi để mục | Lockfile là nguồn sự thật + Renovate auto-merge patch |
| Node version lệch giữa FE và BE              | Một `.nvmrc` duy nhất                                 |
| Copy type hoặc schema giữa FE và BE          | `packages/shared` • client sinh từ OpenAPI            |
| Sửa tay code trong `generated/`              | Sửa `openapi.yaml` rồi regenerate                     |
| Hai pipeline CI song song                    | Một pipeline GitHub Actions                           |
| Deploy single-VM cho sản phẩm cần scale      | Cloud Run + Cloud SQL, blue/green                     |
| `.env` chứa secret ở staging hoặc prod       | Secret Manager, inject lúc runtime                    |
| Không có observability                       | pino + OpenTelemetry + Sentry từ ngày đầu             |
| Test mô tả hành vi tự giả định               | Xác minh contract trước khi viết test                 |
| Refactor lớn kèm feature                     | Tách PR riêng                                         |

---

## 7. Trạng thái hiện tại (agent cập nhật mục này)

- [ ] Monorepo skeleton (pnpm workspace + turbo)
- [ ] contracts/http/openapi.yaml khởi tạo
- [ ] apps/api: Fastify bootstrap + /healthz
- [ ] apps/web: Vite + MUI + Router bootstrap
- [ ] db: migration đầu tiên + seed
- [ ] [compose.dev](http://compose.dev).yml chạy được end-to-end
- [ ] CI: check + contracts:check + gitleaks
- [ ] infra: Terraform Cloud Run + Cloud SQL
- [ ] Observability: pino + OTel + healthcheck
- [ ] e2e: Playwright smoke test

<aside>
⚠️

Cập nhật checklist trên sau mỗi task. Đây là memory của dự án.

</aside>
