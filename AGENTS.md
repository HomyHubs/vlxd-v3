# AGENTS — Chỉ dẫn vận hành cho AI Coding Agent (GỐC)

<aside>
⚠️

Đây là chỉ dẫn **BẮT BUỘC** dành cho bạn — một AI coding agent. Trước khi làm bất kỳ việc gì, hãy đọc hết trang này và tuân thủ tuyệt đối. Trang này cũng chính là **bộ nhớ chung**: mọi trạng thái công việc được ghi tại đây, không giữ trong ngữ cảnh chat.

</aside>

<aside>
📌

Cách dùng: Sao chép toàn bộ nội dung bên dưới, lưu thành file `AGENTS.md` đặt ở **gốc repo**. Khối copy đầy đủ nằm ở cuối trang (mục _Bản đầy đủ để copy_).

</aside>

## 0.0 Bản đồ tài liệu và thứ tự ưu tiên

<aside>
🗺️

Trang này là **GỐC**. Mọi chỉ dẫn khác chỉ là phần bổ sung theo ngữ cảnh và không được mâu thuẫn với trang này. Khi xung đột, trang gốc thắng.

</aside>

| Tài liệu                                                                                                                                                                                                    | Khi nào đọc                                     | Vai trò                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------- |
| Trang này — `AGENTS.md` gốc ở root repo                                                                                                                                                                     | Luôn luôn, đầu mỗi phiên                        | Bắt buộc, cao nhất           |
| Profile công nghệ web app: [Web App Template — Chỉ dẫn vận hành cho AI Coding Agent](https://app.notion.com/p/Web-App-Template-Ch-d-n-v-n-h-nh-cho-AI-Coding-Agent-6a8c6bef3f2b47e795ba8258bf3f42fc?pvs=21) | Khi dự án là web app có frontend và backend     | Bổ sung mục 2.5              |
| `AGENTS.md` con trong từng thư mục chức năng                                                                                                                                                                | Khi sửa file trong thư mục đó                   | Bổ sung phạm vi hợp          |
| `docs/adr/`                                                                                                                                                                                                 | Khi quyết định cross-cutting hoặc khó đảo ngược | Bắt buộc ghi lại             |
| `docs/decision-backlog.md`                                                                                                                                                                                  | Trước khi bắt đầu một mốc lớn                   | Không được vượt gate đang mở |

**Thứ tự ưu tiên khi xung đột:** trang gốc này → profile công nghệ → `AGENTS.md` con → thói quen riêng của agent (thấp nhất).

---

## 0. Quy tắc tối thượng

- Bạn KHÔNG được giữ "trí nhớ" dự án trong đầu. Mọi trạng thái phải nằm trong file này (mục **## Trạng thái tiến độ**).
- Mỗi khi bắt đầu phiên làm việc: ĐỌC file `AGENTS.md` này trước tiên, xác định đang ở đâu, rồi mới code.
- Mỗi khi hoàn thành một bước: CẬP NHẬT ngay mục **## Trạng thái tiến độ** bên dưới.
- Trước khi kết thúc phiên (hoặc khi sắp hết token): GHI rõ trạng thái hiện tại vào file này rồi COMMIT.

---

## 1. Bối cảnh dự án (điền ngay khi khởi tạo repo)

| Trường                    | Giá trị                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Tên dự án                 | vlxd-v3                                                                                  |
| Mục tiêu một dòng         | Web app quản lý cửa hàng vật liệu xây dựng, triển khai theo lát cắt dọc                  |
| Loại dự án                | Web app frontend + backend                                                               |
| Profile công nghệ áp dụng | Web App Template + Vertical Slice                                                        |
| Stack thực tế             | Node 24, pnpm workspace, React + Vite + MUI, Fastify + Zod, PostgreSQL + Kysely + dbmate |
| Điểm khởi đầu             | Slice 0 — Walking skeleton                                                               |
| Cách chạy local           | `docker compose -f compose.dev.yml up --build`                                           |
| Người hoặc nhóm sở hữu    | HomyHubs                                                                                 |

<aside>
🔌

Nếu loại dự án là web app có frontend và backend, bạn PHẢI áp dụng thêm profile công nghệ tại [Web App Template — Chỉ dẫn vận hành cho AI Coding Agent](https://app.notion.com/p/Web-App-Template-Ch-d-n-v-n-h-nh-cho-AI-Coding-Agent-6a8c6bef3f2b47e795ba8258bf3f42fc?pvs=21) — stack chuẩn, cấu trúc monorepo, contract-first OpenAPI, cổng gác CI. Ghi tên profile đã chọn vào bảng trên và vào mục Trạng thái tiến độ.

</aside>

---

## 1.5. Nhận diện cấu trúc repo hiện có (BẮT BUỘC làm trước mục 2)

<aside>
🧭

Trước khi áp dụng bất kỳ sơ đồ thư mục nào, bạn PHẢI quét repo và xác định repo đã được chia thư mục theo chức năng hay chưa. Quyết định của bạn ở bước này định đoạt toàn bộ cách tổ chức file về sau.

</aside>

**Bước làm:**

1. Quét cây thư mục gốc và `src/` (hoặc thư mục nguồn tương đương).
2. Nhận diện xem đã có cách chia theo chức năng/domain hay chưa. Dấu hiệu ĐÃ chia:
   - Thư mục theo feature: `feature1/`, `feature2/`, `feature3/`, `auth/`, `payment/`…
   - Thư mục theo tầng/vai trò: `frontend/`, `backend/`, `api/`, `web/`, `mobile/`…
   - Kiểu monorepo/module hoá: `modules/`, `packages/`, `apps/`, `services/`, `domains/`…
3. Chọn đúng một trong hai trường hợp bên dưới và GHI quyết định vào mục **## Trạng thái tiến độ**.

### Trường hợp A — Repo ĐÃ chia thư mục theo chức năng

<aside>
✅

TUÂN THEO cấu trúc đang có. TUYỆT ĐỐI không đập đi tái cấu trúc, không đổi tên hàng loạt, không gom về `src/features/` nếu repo đang dùng cách khác.

</aside>

- Giữ nguyên quy ước đặt thư mục hiện tại của repo (dù là `feature1/2/3`, `frontend/backend`, `modules/`, `packages/`…).
- Đặt `AGENTS.md` gốc ở root repo (file này).
- Tạo thêm một `AGENTS.md` con **trong từng thư mục chức năng đã tồn tại** để ghi trạng thái riêng của nó.
- Áp các nguyên tắc chung của tài liệu (đóng gói theo module, import qua cửa công khai `index.ts`/entry-point, cổng gác ở mục 4, chốt contract ở mục 5) LÊN CHÍNH cấu trúc sẵn có — không tạo cấu trúc song song mới.
- Nếu repo chưa có "cửa công khai" (barrel/`index.ts`) cho từng module, bổ sung dần khi động vào module đó, KHÔNG refactor ồ ạt ngoài phạm vi task.

### Trường hợp B — Repo CHƯA chia thư mục theo chức năng

<aside>
🆕

Mã còn phẳng/lộn xộn, chưa tách theo feature/domain. Khi đó mới áp dụng sơ đồ cây chuẩn ở mục 2 bên dưới.

</aside>

- Áp dụng sơ đồ `src/features/...` ở mục 2 làm khuôn mẫu.
- Di chuyển dần code vào đúng module theo phạm vi từng task (không refactor toàn bộ một lần).

---

## 2. Sơ đồ cây thư mục (CHỈ áp dụng cho Trường hợp B — repo chưa có cấu trúc)

```
your-project/
├── AGENTS.md                    # File này: chỉ dẫn + trạng thái tiến độ toàn dự án
├── package.json
├── src/
│   ├── app.ts                   # Điểm ghép: mỗi feature tự đăng ký, KHÔNG sửa chồng chéo
│   └── features/                # Mỗi feature = 1 module tự chứa
│       ├── auth/
│       │   ├── AGENTS.md         # Chỉ dẫn + trạng thái RIÊNG của feature auth
│       │   ├── auth.service.ts
│       │   ├── auth.routes.ts
│       │   ├── auth.types.ts
│       │   ├── auth.test.ts
│       │   └── index.ts          # CỬA DUY NHẤT để module khác gọi vào
│       ├── payment/
│       │   ├── AGENTS.md
│       │   ├── payment.service.ts
│       │   ├── payment.routes.ts
│       │   ├── payment.test.ts
│       │   └── index.ts
│       └── notification/
│           ├── AGENTS.md
│           ├── notification.service.ts
│           ├── notification.test.ts
│           └── index.ts
└── tests/
```

**Nguyên tắc cấu trúc bạn PHẢI giữ (áp cho CẢ hai trường hợp A và B):**

- Gom MỌI thứ của một chức năng vào đúng thư mục của nó, không rải rác.
- Module A KHÔNG được import trực tiếp vào file bên trong module B. Chỉ được import qua cửa công khai (`index.ts`/entry-point) của B.
- Mỗi chức năng có một `AGENTS.md` riêng để ghi trạng thái của nó.

---

## 3. Quy tắc bắt buộc khi code

- Trước khi code: đọc mục **## Trạng thái tiến độ** để biết đang ở đâu.
- Chỉ sửa file thuộc phạm vi task hiện tại. TUYỆT ĐỐI không sửa file ngoài phạm vi.
- Commit nhỏ, message rõ ràng, mô tả đúng việc đã làm.
- Sau khi code xong một bước: chạy đầy đủ các "cổng gác" ở mục 4.
- Sau mỗi bước hoàn thành: cập nhật mục **## Trạng thái tiến độ**.

---

## 4. Cổng gác tất định (chạy trước khi coi là "xong")

```bash
npm run lint && npm run typecheck && npm test
```

- PASS hết → được phép commit.
- FAIL → KHÔNG commit vào nhánh chính. Tạo nhánh sửa lỗi: `git checkout -b repair/<mô-tả>` và sửa cho tới khi pass.
- "Đúng hay sai" do test quyết định, không do phán đoán chủ quan của bạn.
- Lệnh trên là tối thiểu. Nếu repo có profile công nghệ, phải chạy đúng cổng gác của profile đó, ví dụ `make check` hoặc `pnpm -r check` bao gồm format, lint không warning, typecheck, unit test, integration test, kiểm tra drift contract, bundle budget, quét secret.
- Lint phải chạy ở chế độ không cho phép warning. Không tắt rule để làm xanh cổng gác.
- Mọi cổng gác chạy được cục bộ phải chạy y nguyên trên CI. Không có bước kiểm tra chỉ tồn tại trên máy cá nhân.

---

## 5. Chốt hợp đồng (contract) TRƯỚC khi làm

Trước khi hiện thực một feature, bạn PHẢI định nghĩa và cố định interface công khai của nó trong cửa công khai (`index.ts`). Không đổi contract giữa chừng.

```tsx
// src/features/auth/index.ts — chốt trước, không đổi giữa chừng
export interface AuthModule {
  getCurrentUser(token: string): Promise<User | null>;
  login(email: string, pass: string): Promise<Token>;
}
```

---

## 6. Làm việc song song nhiều feature (nhiều agent)

Khi có nhiều feature chạy song song, bạn PHẢI cách ly hoàn toàn để không đụng nhau:

```bash
# Mỗi feature một worktree + một nhánh riêng
git worktree add ../proj-auth      -b feature/auth
git worktree add ../proj-payment   -b feature/payment
git worktree add ../proj-notify    -b feature/notification
```

Ràng buộc:

- Mỗi agent chỉ làm trong đúng worktree + nhánh của mình.
- KHÔNG có 2 agent cùng sửa một file dùng chung tại cùng thời điểm.
- Feature có phụ thuộc (ví dụ payment cần auth) thì làm TUẦN TỰ: xong auth mới tới payment. Không song song thứ phụ thuộc nhau.

Với file dùng chung bắt buộc (như router tổng), dùng "điểm ghép tự động", mỗi dòng độc lập để giảm conflict:

```tsx
// src/app.ts
import { registerAuthRoutes } from "./features/auth";
import { registerPaymentRoutes } from "./features/payment";
registerAuthRoutes(app);
registerPaymentRoutes(app);
```

---

## 7. Quy trình ghép (integration)

Gộp từng nhánh một, test pass mới gộp tiếp:

```bash
git checkout main
git merge feature/auth
npm test            # PASS mới được gộp cái tiếp theo
git merge feature/payment
npm test
```

---

## 8. Quy trình bàn giao khi đổi tool / hết token

Khi sắp hết token hoặc kết thúc phiên, bạn PHẢI:

1. Cập nhật đầy đủ mục **## Trạng thái tiến độ** (đang viết hàm nào, file nào, còn thiếu gì).
2. Commit lại kể cả khi chưa xong: `git commit -m "wip: <mô tả>"`.
3. Agent kế tiếp khi vào phiên mới chỉ cần đọc `AGENTS.md` này là tiếp tục được, không mất mạch.

---

## 9. Bảo mật và secret (không thoả hiệp)

- Không commit secret vào repo, image, log, fixture hay tài liệu. Chỉ commit file ví dụ như `.env.example` với giá trị giả.
- Secret thật nạp lúc runtime từ secret manager. Không dùng file `.env` cho staging hoặc production.
- Bật quét secret trong CI (ví dụ gitleaks). Nếu phát hiện secret đã lọt, coi như đã rò rỉ: thu hồi và xoay khoá trước, xoá lịch sử sau.
- Không in secret, token, header `Authorization` hay dữ liệu cá nhân ra log, terminal, issue hay chat.
- Mọi input từ bên ngoài (body, query, param, biến môi trường) phải được validate bằng schema trước khi dùng.
- Thêm dependency mới phải ghi lý do trong PR và kiểm tra lỗ hỏng đã biết.

---

## 10. Nhật ký, quan sát, xử lý lỗi

- Dùng logger có cấu trúc, mỗi log là một bản ghi có trường, kèm request-id lan truyền từ frontend xuống backend. Không rải `console.log`.
- Bật redact cho trường nhạy cảm ngay tại cấu hình logger.
- Mọi service phải có endpoint kiểm tra sức khoẻ, tách riêng "còn sống" và "sẵn sàng nhận traffic".
- Lỗi trả về theo bộ error code tập trung, không ném thông điệp tự do từ từng chỗ. Không lộ stack trace ra client.
- Không bắt lỗi rồi bỏ qua im lặng. Đã bắt thì phải log hoặc chuyển thành lỗi có nghĩa.

---

## 11. Dữ liệu và migration

- Migration là append-only. Không sửa migration đã merge, chỉ thêm migration mới.
- Mỗi migration phải đảo ngược được và đã test rollback trước khi coi là xong.
- Không sửa schema trực tiếp trên bất kỳ môi trường nào. Mọi thay đổi đi qua migration được commit.
- Thay đổi phá vỡ phải chia hai bước: thêm cái mới và tương thích ngược trước, xoá cái cũ ở release sau.
- Seed tách riêng theo môi trường. Dữ liệu thử không được lẫn vào production.
- Integration test chạy trên database thật dụng trong container, không mock tầng truy cập dữ liệu.

---

## 12. Contract API và code sinh tự động

- Nếu dự án có API giữa frontend và backend, spec là nguồn sự thật duy nhất. Sửa spec trước, sinh lại client, rồi mới viết code.
- Thư mục code sinh tự động không được sửa tay. Muốn đổi thì đổi spec.
- CI phải có gate chống lệch giữa spec và code sinh ra. Gate đỏ thì không merge.
- Kiểu dữ liệu và schema dùng chung giữa hai đầu phải ở một package chia sẻ. Không copy thủ công.

---

## 13. Tài liệu và ADR

- Quyết định cross-cutting hoặc khó đảo ngược phải có ADR đánh số tuần tự trong `docs/adr/`.
- ADR đã ở trạng thái Accepted hoặc Rejected là bất biến. Muốn đổi thì tạo ADR mới thay thế và cập nhật index.
- Rule dùng chung nhiều dự án để ở `standards/`. Tài liệu riêng dự án để ở `docs/`. Không nhân bản cùng một rule ở hai nơi.
- Sửa hành vi thì sửa luôn tài liệu sở hữu hành vi đó trong cùng PR.

---

## 14. Quy ước commit và pull request

- Commit theo Conventional Commits, ví dụ `feat(auth): ...`, `fix(api): ...`, `docs(adr): ...`, `wip: ...` khi bàn giao giữa phiên.
- Một PR giải quyết một mục đích. Refactor lớn tách PR riêng, không gắn kèm feature.
- PR phải nêu: làm gì, tại sao, ảnh hưởng tới đâu, đã test thế nào, dependency mới nếu có và lý do.
- Không force push lên nhánh người khác đang dùng. Không commit trực tiếp lên nhánh chính.

---

## 15. Definition of Done

Một task chỉ được coi là xong khi đủ tất cả:

- [ ] Contract của module đã được chốt và không đổi giữa chừng; nếu có API thì spec đã cập nhật và client đã sinh lại
- [ ] Có test cho logic nghiệp vụ và test tích hợp cho đường đi qua dữ liệu thật
- [ ] Toàn bộ cổng gác ở mục 4 xanh cả cục bộ và trên CI
- [ ] Không thêm secret, không thêm kiểu dữ liệu bỏ kiểm tra, không tắt rule lint mà không ghi lý do
- [ ] Log có cấu trúc và request-id; lỗi trả về theo error code tập trung
- [ ] Migration đảo ngược được và đã test rollback
- [ ] Chỉ sửa file trong phạm vi task, không rò rỉ refactor ngoài phạm vi
- [ ] Tài liệu hoặc ADR liên quan đã cập nhật
- [ ] Mục Trạng thái tiến độ đã cập nhật và đã commit

---

## 16. Anti-pattern cấm tuyệt đối

| Anti-pattern                                           | Thay bằng                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Giữ tiến độ trong đầu hoặc trong ngữ cảnh chat         | Ghi vào mục Trạng thái tiến độ và commit                           |
| Đập đi tái cấu trúc repo đã có quy ước                 | Trường hợp A ở mục 1.5, bổ sung dần theo task                      |
| Import thẳng vào file bên trong module khác            | Chỉ import qua cửa công khai `index.ts`                            |
| Đổi contract giữa chừng khi đang code                  | Chốt contract trước, đổi thì làm ADR                               |
| Tắt rule lint hoặc bỏ test để làm xanh cổng gác        | Sửa nguyên nhân, nếu phải tắt thì ghi lý do ngay tại chỗ           |
| Sửa tay code sinh tự động                              | Sửa spec rồi sinh lại                                              |
| Sửa migration đã merge                                 | Thêm migration mới                                                 |
| Copy kiểu dữ liệu giữa frontend và backend             | Package chia sẻ hoặc client sinh từ spec                           |
| Secret trong file môi trường ở staging hoặc production | Secret manager, nạp lúc runtime                                    |
| Không có log có cấu trúc và healthcheck                | Thêm ngay từ ngày đầu                                              |
| Hai agent cùng sửa một file dùng chung cùng lúc        | Worktree riêng, điểm ghép mỗi dòng độc lập, mục 6                  |
| Kết thúc phiên mà không commit và không ghi trạng thái | Quy trình bàn giao ở mục 8                                         |
| Refactor lớn gán kèm feature trong một PR              | Tách PR                                                            |
| Đánh số lại hoặc xoá slice/task khi đổi phạm vi        | ID bất biến, chỉ thêm dòng mới, mục 17                             |
| Sửa lại nội dung task đã ship để "cho khớp" hiện tại   | Giữ lịch sử, tạo slice/task sửa riêng                              |
| Code trước rồi mới cập nhật tài liệu phạm vi           | Cập nhật phạm vi + sổ thay đổi trước, rồi mới code                 |
| Xoá cứng bảng dữ liệu khi bỏ tính năng                 | Đánh dấu deprecated, migration đảo ngược được, giữ dữ liệu lịch sử |

---

## 17. Quy trình thay đổi phạm vi (thêm / sửa / xóa tính năng)

<aside>
🔒

**Nguyên tắc gốc: ID của slice/task là bất biến.** Không đánh số lại, không dùng lại số đã cấp, không xoá dòng khỏi tài liệu. Mọi thay đổi phạm vi đều là **thêm dòng mới**, không phải viết lại quá khứ. Nhờ vậy commit, PR, tên migration và `TODO(<id>)` trong code luôn trỏ đúng.

</aside>

### 17.1 Quy tắc đánh số

| Tình huống                           | Cách làm                                                                    | Ví dụ               |
| ------------------------------------ | --------------------------------------------------------------------------- | ------------------- |
| Tính năng mới, làm sau cùng          | Cấp ID tiếp theo                                                            | Slice 9, Slice 10   |
| Tính năng mới phải chèn giữa         | Dùng số thập phân, không đẩy các mục sau                                    | Slice 4.5           |
| Mục công việc quá to                 | Giữ số gốc, thêm hậu tố chữ                                                 | Slice 5 → 5a, 5b    |
| Thêm/sửa task ở mục **chưa bắt đầu** | Sửa trực tiếp                                                               | thêm 3.4            |
| Thêm/sửa task ở mục **đã xong**      | Giữ nguyên làm lịch sử; tạo mục sửa riêng kèm dòng `Thay đổi mục gốc: <id>` | Slice 2 → Slice 2.1 |
| Bỏ tính năng chưa code               | Đổi trạng thái `Đã huỷ` • ghi lý do, giữ nguyên dòng                        | —                   |
| Bỏ tính năng đã code                 | Tạo mục retire riêng với checklist gỡ bỏ                                    | Slice 11 — Retire X |

### 17.2 Ba loại thay đổi

**A. Thêm tính năng**

1. Mô tả phạm vi mới (DB, contract, UI, quyền, cấu hình) trước khi code.
2. Cấp ID mới và thêm vào **Trạng thái tiến độ** với trạng thái `Chưa bắt đầu`.
3. Thêm 1 dòng vào **Sổ thay đổi phạm vi** (mục 17.5).
4. Nếu ảnh hưởng kiến trúc hoặc khó đảo ngược → ghi ADR trong `docs/adr/`.
5. Không chỉnh bất kỳ mục nào khác.

**B. Sửa tính năng đã có trong danh sách**

| Trạng thái   | Được phép                                         | Không được phép                                |
| ------------ | ------------------------------------------------- | ---------------------------------------------- |
| Chưa bắt đầu | Sửa tự do nội dung task, thêm/bỏ/đổi thứ tự       | Đổi ID                                         |
| Đang làm     | Chỉ sửa phần chưa code; ghi lý do vào sổ thay đổi | Mở rộng phạm vi ngoài contract đã chốt (mục 5) |
| Đã xong      | Giữ nguyên làm lịch sử                            | Sửa lại nội dung task đã ship                  |

**C. Xóa tính năng**

- **Chưa code:** đổi trạng thái `Đã huỷ` + ghi lý do. Không xoá dòng để còn dấu vết quyết định.
- **Đã code:** tạo mục retire riêng, checklist bắt buộc:
  - [ ] Xoá entry point và route/UI dẫn vào tính năng.
  - [ ] Xoá endpoint khỏi spec API, sinh lại client (mục 12).
  - [ ] Xoá module và cửa công khai không còn dùng, kiểm tra không còn import.
  - [ ] Xoá cấu hình, feature flag, quyền và chuỗi hiển thị không còn dùng.
  - [ ] **Không xoá cứng bảng dữ liệu nghiệp vụ** — đánh dấu deprecated, migration đảo ngược được, giữ dữ liệu lịch sử (mục 11).
  - [ ] Ghi ADR: lý do bỏ và cách xử lý dữ liệu cũ.

### 17.3 Checklist đánh giá ảnh hưởng (làm trước khi chấp nhận thay đổi)

1. Có đổi **schema dữ liệu** không? Migration mới có đảo ngược được không?
2. Có đổi **contract/spec API** không? Phá vỡ hay chỉ thêm?
3. Có đổi **quyền/phân quyền** không? Ai bị ảnh hưởng?
4. Có đổi **cấu hình, hạn mức, hoặc điều khoản thương mại** không?
5. Có chuỗi hiển thị hoặc tài liệu nào cần thêm/bỏ không?
6. Mục công việc nào đang **phụ thuộc** vào phần bị sửa?
7. Có làm vỡ mốc phạm vi đã chốt không? Nếu có thì chẻ nhỏ.

Nếu câu 1, 2, 3 hoặc 4 trả lời "có" → **bắt buộc ghi ADR** theo mục 13.

### 17.4 Trạng thái được phép dùng

| Trạng thái    | Ý nghĩa                                |
| ------------- | -------------------------------------- |
| Chưa bắt đầu  | Đã lên kế hoạch, chưa có code          |
| Đang làm      | Đã mở nhánh/PR                         |
| Xong          | Đạt đủ Definition of Done ở mục 15     |
| Xong (còn nợ) | Chạy được nhưng còn nợ kỹ thuật đã ghi |
| Hoãn          | Có giá trị nhưng lùi lịch, ghi lý do   |
| Đã huỷ        | Quyết định không làm, ghi lý do        |
| Đã thay thế   | Bị mục khác thay, ghi rõ ID thay thế   |

### 17.5 Sổ thay đổi phạm vi (bắt buộc ghi, chỉ thêm dòng mới)

| Ngày | Loại                                       | ID liên quan | Nội dung thay đổi | Lý do | ADR |
| ---- | ------------------------------------------ | ------------ | ----------------- | ----- | --- |
| _…_  | _Thêm / Sửa / Huỷ / Hoãn / Chẻ / Thay thế_ | _…_          | _…_               | _…_   | _…_ |
| 2026-09-02 | Thêm | Slice 2 | Chốt phạm vi Sản phẩm: xem và tạo, gồm migration `product`/`unit`, API danh sách/tạo, UI `/products` và giới hạn gói Free 80 sản phẩm. | Tiếp tục lộ trình Vertical Slice sau khi Slice 0 và Slice 1 hoàn tất. | Không cần — chưa thay đổi schema/API thực tế trong commit tài liệu này. |
| 2026-09-02 | Thêm | Slice 4 | Nhập kho (Inbound Stock Receipts): migration `stock_receipts`, `stock_receipt_lines`, `stock_movements`; API `/stock-receipts`; UI `/inventory/receipts/new`, `/inventory/receipts`, `/inventory/receipts/:id`. | Lát cắt nghiệp vụ tiếp theo trong lộ trình Vertical Slice. | Không cần — tương thích schema, tuân thủ contract-first. |
| 2026-09-03 | Thêm | Slice 5 | Bán hàng: đơn hàng đầu tiên (Sales Orders & Stock Deductions): migration `customers`, `sales_orders`, `sales_order_lines`; API `/sales-orders`, `/customers`; UI `/orders/new`, `/orders`, `/orders/:id`; trừ tồn kho qua `stock_movements` và chặn bán vượt tồn (`INSUFFICIENT_STOCK`). | Lát cắt nghiệp vụ mẫu theo lộ trình Vertical Slice. | Không cần — tương thích schema, tuân thủ contract-first. |

### 17.6 Thứ tự thao tác bắt buộc

1. Cập nhật tài liệu trước: phạm vi mới/sửa → Trạng thái tiến độ → Sổ thay đổi phạm vi.
2. Ghi ADR nếu checklist 17.3 yêu cầu.
3. Sau đó mới code, và chỉ code trong phạm vi đã ghi.

AI agent **không được tự ý** đánh số lại, gộp, hay xoá mục công việc. Nếu thấy cần, **đề xuất** rồi chờ xác nhận. Chỉ làm mục ở trạng thái `Chưa bắt đầu` hoặc `Đang làm`; bỏ qua mục `Đã huỷ`/`Đã thay thế`.

---

## Trạng thái tiến độ

<aside>
🧠

Khu vực bộ nhớ chung. Luôn cập nhật mục này. Đây là phần thay thế cho `PROGRESS.md`.

</aside>

**Quyết định cấu trúc repo (mục 1.5):** [ ] Trường hợp A (theo cấu trúc sẵn có) — [x] Trường hợp B (áp cấu trúc monorepo theo profile Web App)

**Profile công nghệ áp dụng (mục 0.0 và 1):** [x] Web app FE+BE — [ ] Không áp profile nào

**Cổng gác thực tế của repo này (mục 4):** `pnpm check` và `pnpm contracts:check` — đã xác minh chạy được: [x] cục bộ [ ] CI (2026-09-02)

### Task hiện tại

Slice 6 — Phân quyền hiển thị được (RBAC & Capabilities) — PR #7: Hoàn thành giải quyết triệt để finding B1 và đề xuất N2 từ Round 4 của `/gpt-web-review`:
- B1 (Chống tự huỷ/revert authentication query khi chuyển đổi tenant hoặc hết hạn session):
  - Sửa `clearTenantCache(queryClient)` thêm predicate `{ predicate: (query) => query.queryKey[0] !== "auth" }` cho cả `cancelQueries()` và `removeQueries()`, bảo đảm tuyệt đối không bao giờ can thiệp hay revert query `["auth", "me"]`.
  - Tách logic dọn cache nghiệp vụ ra khỏi `queryFn` của `useCurrentUser()` chuyển sang `useEffect` kích hoạt khi identity thay đổi (`newTenantId !== currentTenantId`), giữ `queryFn` là hàm thuần tuý chỉ fetch dữ liệu.
  - Bổ sung 2 test suite theo luồng production trong `TenantCacheIsolation.test.tsx`:
    1. Bắt đầu với auth cache của Tenant A, refetch thực sự `AUTH_QUERY_KEY` với dữ liệu Tenant B, xác nhận auth cache lưu trữ thành công Tenant B (không bị revert) và toàn bộ query của Tenant A bị dọn sạch khỏi cache.
    2. Bắt đầu với auth cache của Tenant A, refetch thực sự `AUTH_QUERY_KEY` nhận 401 Unauthorized, xác nhận auth cache trở về `null`, toàn bộ query nghiệp vụ bị dọn sạch và UI render Unauthenticated.
- N2 (Đồng bộ bootstrap seed trong docker compose): Thêm service `seed` vào `compose.dev.yml` tự động chạy `psql -f /db/seeds/dev.sql` ngay sau khi `migrate` hoàn tất.
Toàn bộ cổng gác cục bộ `pnpm check` và `pnpm contracts:check` pass 100% (113 tests [71 api tests + 42 web tests], 0 lint warnings, clean build). Đang chuẩn bị push commit và trigger Round 5 review.

### Đã xong

- [x] Slice 0 — PR #1 đã squash-merge vào `main` (`9342b62`), review Round 3 verdict `APPROVED_TO_MERGE`, 0 blocker.
- [x] Task 1.1 — migration thuận nghịch `tenant`, `user`, `session` và dev seed.
- [x] Task 1.2 — `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` dùng opaque session cookie (httpOnly, sameSite=lax, Secure flag fail-closed).
- [x] Task 1.3 — trang `/login`, route guard, header hiện tên user, i18n vi và en, component tests.
- [x] Fix review findings PR #2 (B001 hash session token với sha256, B002 fail-closed secure cookie flag).
- [x] PR #2 đã được review bởi Notion AI chat (Agent B): Round 2 verdict `APPROVED_TO_MERGE`, 0 blocker.
- [x] Squash-merge PR #2 vào `main` (`2d7f4b3`) và xoá nhánh `feature/slice-1` (cục bộ & remote).
- [x] Slice 2 — Sản phẩm (PR #5 squash-merge vào `dev` tại `07f1476`).
- [x] Slice 3 — Kho & tồn (đã hoàn thành trên `dev` tại commit `bed43a8`).
- [x] Slice 4 — Nhập kho (đã hoàn thành trên `dev` tại commit `7981907`).
- [x] Slice 5 — Bán hàng: đơn hàng đầu tiên (Sales Orders & Stock Deductions). PR #6 squash-merge vào `dev` (`af65166`).
  - [x] Task 5.1 — Migration `customers`, `sales_orders`, `sales_order_lines`, DB types và rollback integration test.
  - [x] Task 5.2 — Contract OpenAPI 3.1 & API `POST /sales-orders`, `GET /sales-orders`, `GET /sales-orders/{id}`, `GET /customers`, `POST /customers` (atomic conditional stock deduction, INSUFFICIENT_STOCK check, bounded safe integers, high entropy order number with 3x retry on collision).
  - [x] Task 5.3 — UI Tạo đơn hàng mới (`/orders/new`) defaulting Khách lẻ, tính tổng tự động, xử lý lỗi tồn kho.
  - [x] Task 5.4 — UI Danh sách đơn và Chi tiết đơn (`/orders`, `/orders/:id`), i18n vi/en, component tests pass.
  - [x] Review loop (`/gpt-web-review`): 6 rounds review nghiêm ngặt với ChatGPT Web qua Chrome DevTools MCP, giải quyết triệt để race conditions, safe integer overflow bounds, cumulative stock level ceiling với PostgreSQL check constraint `stock_levels_quantity_ceiling`, và test concurrency missing-row. 100% CI pass.
- [x] Slice 6 — Phân quyền hiển thị được (RBAC & Capabilities):
  - [x] Task 6.1 — Migration `202609030007_create_rbac_tables.sql` (bảng `capabilities`, `role_groups`, `role_group_capabilities`, `titles`, `title_role_groups`, `user_titles`, seed quyền và chức danh mặc định, rollback integration test).
  - [x] Task 6.2 — OpenAPI 3.1 spec, Fastify `/titles`, `/users` (GET, POST), middleware `createRequireCapability`, argon2id password hashing, email uniqueness check.
  - [x] Task 6.3 — Hook `useHasCapability`, UI `/settings/users`, dialog tạo tài khoản nhân viên, điều kiện hoá menu điều hướng và ProtectedRoute theo `users.manage`, badge chức danh trên header, i18n vi/en, component tests pass.
  - [x] Task 6.4 — RBAC enforcement trên toàn bộ business routes (`products.*`, `warehouses.*`, `stock-receipts.*`, `customers.*`, `sales-orders.*`, `users.*`) với 403 FORBIDDEN khi thiếu capability, cập nhật OpenAPI 3.1 và error schema enums.
  - [x] Fix Round 1 Findings — Loại bỏ email/PII khỏi auth service error logging, thêm test suite kiểm tra bảo mật log.
  - [x] Fix Round 2 Findings — Enforce capability-based route guards & dashboard links across all business surfaces, hide mutation buttons when lacking manage/create capability, decouple migration backfill from test email, resolve capabilities before session insert, add Role-Matrix UI suite for OWNER, SALES, WAREHOUSE.
  - [x] Fix Round 3 Findings — Enforce cross-tenant cache isolation, align authoritative capabilities in dev seed and UI tests, guard empty-state sales order CTA, add delayed-response cache isolation test and read-only sales tests.
  - [x] Fix Round 4 Findings — Sửa `cancelQueries` predicate loại trừ auth query, chuyển tenant cache clearing sang `useEffect` của `useCurrentUser`, thêm 2 test suite production-path cho Tenant B và 401, thêm `seed` service vào `compose.dev.yml`.
  - [x] Fix Round 5 Findings — Ngăn chặn race condition `/auth/me` đè kết quả login/logout qua generational tracking (`authGeneration`) và huỷ query retryer (`cancelQueries`), tenant-scope toàn bộ query key nghiệp vụ (`products`, `warehouses`, `stock-receipts`, `sales-orders`, `customers`) và disable khi chưa xác định tenant, đồng bộ đăng nhập/đăng xuất đa tab qua `BroadcastChannel`, theo dõi chuyển đổi session theo `tenantId:userId`, thêm atomic flag `-v ON_ERROR_STOP=1 --single-transaction` cho seed container, bổ sung 3 test suite kiểm tra triệt để race conditions và ProductsPage business surface isolation.
  - [x] Cổng gác tất định: `pnpm check` (format, lint 0 warnings, typecheck 4/4 packages, 116 tests pass [71 api tests + 45 web tests], production build, contracts lint & drift check) pass 100%.

### Đang làm dở

- [ ] Push commit Round 4 fix lên PR #7 (`feature/slice-6`) và thực hiện Round 5 review loop `/gpt-web-review`.

### Bước tiếp theo

- [ ] Đạt verdict `APPROVED_TO_MERGE` từ Agent B, auto-merge PR #7 vào nhánh `dev`.
- [ ] Chuyển sang Slice tiếp theo.

---

## Mẫu `AGENTS.md` con cho mỗi thư mục chức năng

Đặt trong từng thư mục feature/domain (dù là feature sẵn có ở Trường hợp A hay feature mới ở Trường hợp B):

```markdown
# AGENTS.md — <tên feature>

## Bối cảnh feature

- Nhiệm vụ: [1-2 dòng]
- Phụ thuộc: [module nào, qua cửa công khai nào]

## Contract (cửa công khai — chốt trước, không đổi giữa chừng)

- [liệt kê hàm/interface export ra ngoài]

## Trạng thái tiến độ

### Đã xong

- [ ] ...

### Đang làm dở

- [ ] ...

### Bước tiếp theo

- [ ] ...
```

[Web App Template — Chỉ dẫn vận hành cho AI Coding Agent](https://app.notion.com/p/Web-App-Template-Ch-d-n-v-n-h-nh-cho-AI-Coding-Agent-6a8c6bef3f2b47e795ba8258bf3f42fc?pvs=21)

Slice 3 status (2026-09-02): Tasks 3.1-3.3 implemented on feature/slice-3; generated client and final gate remain before review.
