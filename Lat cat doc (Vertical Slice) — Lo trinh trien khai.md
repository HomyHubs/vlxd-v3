# Lát cắt dọc (Vertical Slice) — Lộ trình triển khai vlxd

<callout icon="🪚">Tài liệu này **thay đổi cách triển khai** dự án `HomyHubs/vlxd`: từ "làm xong backend rồi mới làm frontend" sang **lát cắt dọc (vertical slice)**. Mỗi 2–4 task phải cho ra **một màn hình bấm được**, dù logic bên trong còn giả lập.

</callout>

Tài liệu gốc: [[AGENTS.md](http://AGENTS.md) — vlxd (Quản lý Vật liệu xây dựng)](https://app.notion.com/p/AGENTS-md-vlxd-Qu-n-l-V-t-li-u-x-y-d-ng-90aba91216c746d4ae12153ce6d0698a?pvs=21). Khi có xung đột về thứ tự triển khai, tài liệu này thắng; các nguyên tắc kiến trúc trong AGENTS.md gốc vẫn giữ nguyên.

## 1. Lát cắt dọc là gì

Một lát cắt dọc là **một luồng nhỏ nhưng đầy đủ từ đầu đến cuối**, đi xuyên qua toàn bộ hệ thống.

```
UI (nút Đặt hàng)
   ↓ gọi API
API route (nhận request, validate Zod)
   ↓
Service (xử lý đơn giản nhất có thể)
   ↓
Database (lưu 1 bản ghi)
   ↓ trả response
UI hiển thị "Đặt hàng thành công"
```

Nguyên tắc:

- Chọn **một tính năng rất nhỏ**, làm đủ các phần cần thiết để nó chạy được thật.
- Không làm hết backend rồi mới làm frontend.
- Dù tính năng còn nhỏ, nó đã chạm Frontend → Backend → Database → Frontend.
- Chiều rộng (nhiều tính năng) đến sau; chiều sâu (chạy được) đến trước.

### Ngược lại: lát cắt ngang (cấm dùng làm mặc định)

| Lát cắt ngang (tránh) | Lát cắt dọc (dùng) |
| --- | --- |
| Làm xong toàn bộ DB schema 20 bảng | Làm 1–2 bảng đủ cho luồng đang chạy |
| Làm xong hết API rồi mới có UI | Mỗi API ra đời cùng UI gọi nó |
| 3 tuần không thấy gì để bấm | 2–4 task là có màn hình để bấm |
| Demo bằng Postman | Demo bằng trình duyệt |

## 2. Quy tắc bắt buộc của phương pháp

1. **Mỗi slice tối đa 2–4 task.** Nếu ước lượng nhiều hơn, phải chẻ nhỏ slice.
2. **Mỗi slice kết thúc bằng một màn hình chạy được trong browser.** Không có UI = slice chưa xong.
3. **Cho phép giả lập (stub) có kiểm soát.** Logic phức tạp được phép trả dữ liệu tối giản, nhưng phải:
    - Có route thật, response thật, không mock ở tầng frontend.
    - Ghi `TODO(slice-N)` tại đúng chỗ giả lập.
    - Ghi vào mục Trạng thái ở cuối trang này.
4. **Được phép bấm nút mà chưa có nghiệp vụ đầy đủ.** Nút có thể chỉ tạo bản ghi thô, chưa tính tồn kho, chưa tính công nợ.
5. **Không được giả lập những thứ sau:** auth/session, kiểm tra quyền (capability), giới hạn gói dịch vụ, và i18n key. Bốn thứ này làm thật ngay từ slice có liên quan.
6. **Vertical không phá kiến trúc.** Vẫn tuân thủ: feature slice, import qua `index.ts`, Zod ở biên, contract-first với `contracts/http/openapi.yaml`, FE không gọi Supabase trực tiếp.
7. **Mỗi slice là một PR.** PR mô tả: luồng nào chạy được, cách bấm thử, phần nào còn stub.

## 3. Định nghĩa Slice hoàn thành (Definition of Done cho 1 slice)

- [ ]  Mở browser, đăng nhập được, đi tới màn hình của slice.
- [ ]  Bấm được hành động chính, thấy phản hồi thành công/lỗi trên UI.
- [ ]  Có ít nhất 1 request thật tới `apps/api` (xem được ở Network tab).
- [ ]  Có ít nhất 1 thay đổi/đọc dữ liệu thật ở Postgres (nếu slice có dữ liệu).
- [ ]  OpenAPI cập nhật trước code, api-client đã regenerate.
- [ ]  Migration reversible (nếu đổi DB).
- [ ]  Text UI đi qua i18next, có `vi` (bắt buộc) và `en` (hoặc fallback rõ ràng).
- [ ]  Quyền và giới hạn gói được enforce ở backend nếu slice có liên quan.
- [ ]  Có test tối thiểu: 1 test service/route + 1 test render UI.
- [ ]  `pnpm -r check` xanh.
- [ ]  Cập nhật mục **Trạng thái slice** ở cuối trang này (danh sách stub còn nợ).

## 4. Lộ trình slice cho vlxd

Thứ tự dưới đây đi từ "hệ thống chạy được" → "nghiệp vụ cốt lõi" → "tiền và báo cáo".

### Slice 0 — Walking skeleton (khung đi được)

Mục tiêu: một màn hình trắng có nút, bấm nút gọi API thật, API đọc DB thật.

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 0.1 | Monorepo skeleton tối giản: `apps/web`, `apps/api`, `packages/shared`, `.nvmrc`, pnpm workspace, `pnpm -r check` | `pnpm dev` chạy được cả hai app |
| 0.2 | `GET /health` (Fastify + Zod) + `contracts/http/openapi.yaml` phiên bản đầu + generate `packages/api-client` | `/health` trả `{ status: "ok", db: "ok" }` |
| 0.3 | Kết nối Supabase Postgres bằng Kysely + dbmate migration đầu tiên (bảng `app_meta`) | `/health` báo `db: ok` từ query thật |
| 0.4 | Trang `/` MUI + i18next (`vi` mặc định) + nút "Kiểm tra hệ thống" gọi `/health` | Bấm nút → hiện "Hệ thống hoạt động bình thường" |

**Demo:** mở browser, bấm 1 nút, thấy chữ tiếng Việt xác nhận toàn bộ chuỗi FE → API → DB đã sống.

### Slice 1 — Đăng nhập thật

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 1.1 | Migration `tenant`, `user`, `session`; seed 1 tenant + 1 user Chủ cửa hàng | Có dữ liệu để đăng nhập |
| 1.2 | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` với opaque session cookie | Session thật, không JWT tự chế |
| 1.3 | Trang `/login` (react-hook-form + Zod) + route guard + hiển thị tên user trên header | Đăng nhập → vào trang chủ; đăng xuất → về `/login` |

**Stub cho phép:** chưa có quên mật khẩu, chưa có 2FA, chưa có mời user.

### Slice 2 — Sản phẩm: xem và tạo

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 2.1 | Migration `product`, `unit` (đơn vị: viên, bao, tấn, kg, m³, cây, tấm, thùng) + seed vài đơn vị | Danh mục đơn vị có sẵn |
| 2.2 | `GET /products` (phân trang, tìm kiếm), `POST /products` | API contract-first |
| 2.3 | Trang `/products` bằng material-react-table + dialog "Thêm sản phẩm" | Bấm "Thêm sản phẩm" → lưu → bảng tự refresh |
| 2.4 | Enforce giới hạn gói: Free 80 sản phẩm, trả `PRODUCT_LIMIT_REACHED`; FE dịch thông báo | Vượt hạn mức → hiện thông báo tiếng Việt rõ ràng |

### Slice 3 — Kho và tồn kho hiển thị

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 3.1 | Migration `warehouse`, `stock_level` (tồn theo sản phẩm × kho) | Nền tảng tồn kho |
| 3.2 | `GET /warehouses`, `POST /warehouses`  • enforce giới hạn kho theo gói | Tạo kho, chặn khi vượt gói |
| 3.3 | Trang `/warehouses`  • cột "Tồn kho" trên trang sản phẩm (đọc `stock_level`) | Thấy số tồn (tạm thời bằng 0) |

### Slice 4 — Nhập kho (luồng làm tồn kho biến động thật)

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 4.1 | Migration `stock_receipt`, `stock_receipt_line`, `stock_movement` | Sổ chuyển động kho |
| 4.2 | `POST /stock-receipts` — transaction: ghi phiếu + ghi movement + cập nhật `stock_level` | Tồn kho thay đổi có kiểm soát |
| 4.3 | Trang `/inventory/receipts/new`: chọn kho, thêm dòng sản phẩm, số lượng, lưu | Bấm "Lưu phiếu nhập" → tồn kho tăng thật |
| 4.4 | Trang danh sách phiếu nhập + trang chi tiết (read-only) | Xem lại phiếu vừa tạo |

**Stub cho phép:** chưa có giá nhập bình quân, chưa gắn nhà cung cấp, chưa có hủy phiếu.

### Slice 5 — Bán hàng: đơn hàng đầu tiên (lát cắt mẫu trong yêu cầu)

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 5.1 | Migration `customer`, `sales_order`, `sales_order_line`  • seed khách lẻ | Có khách để chọn |
| 5.2 | `POST /sales-orders`: validate tồn, trừ tồn qua `stock_movement`, trạng thái `confirmed` | Bán hàng làm giảm tồn thật |
| 5.3 | Trang `/orders/new`: chọn khách, thêm sản phẩm, thấy tổng tiền VND, nút **Đặt hàng** | Bấm "Đặt hàng" → "Đặt hàng thành công" |
| 5.4 | Trang `/orders`  • chi tiết đơn; chặn bán vượt tồn với error code riêng | Bán quá tồn → thông báo tiếng Việt |

### Slice 6 — Phân quyền hiển thị được

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 6.1 | Migration `title`, `role_group`, `capability`, `user_title`; seed theo mục 4 của [AGENTS.md](http://AGENTS.md) gốc | Dữ liệu quyền chuẩn |
| 6.2 | Middleware `requireCapability`  • `GET /auth/me` trả danh sách capability | Backend là nơi enforce |
| 6.3 | Trang `/settings/users`: tạo user, gán title; menu và nút ẩn/khóa theo capability | Đăng nhập bằng Nhân viên bán hàng → không thấy mục Cài đặt |

### Slice 7 — Thanh toán và công nợ tối giản

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 7.1 | Migration `payment`, `invoice` (tối giản) + liên kết đơn hàng | Nền tảng tiền |
| 7.2 | `POST /orders/{id}/payments`  • tính `remaining_amount` | Ghi nhận thu tiền |
| 7.3 | Trang chi tiết đơn: nút "Ghi nhận thanh toán" + badge Đã trả/Còn nợ | Bấm thanh toán → badge đổi ngay |

### Slice 8 — Báo cáo đầu tiên

| # | Task | Kết quả bấm được |
| --- | --- | --- |
| 8.1 | `GET /reports/sales-summary` (theo ngày/tuần) | Số liệu thật từ DB |
| 8.2 | Trang `/reports`: thẻ doanh thu + bảng top sản phẩm | Xem báo cáo trên browser |
| 8.3 | Trang `/settings/plan`: xem gói hiện tại và mức sử dụng | Thấy hạn mức đang dùng |

### Sau Slice 8

Các nghiệp vụ còn lại (xuất kho, chuyển kho, kiểm kho, trả hàng, mua hàng, audit log, OCR, AI agent chat/voice) tiếp tục theo **đúng khuôn slice**: mỗi slice 2–4 task, kết thúc bằng một màn hình bấm được.

## 5. Mẫu mô tả slice (dùng cho mọi slice mới)

```
### Slice N — <tên luồng>

Mục tiêu demo: <người dùng bấm gì, thấy gì>

Phạm vi:
- DB: <bảng/migration tối thiểu>
- API: <endpoint + OpenAPI>
- UI: <route + component>
- i18n: <namespace key>
- Quyền: <capability cần>
- Gói: <giới hạn cần enforce>

Cho phép stub:
- <danh sách stub + TODO(slice-N)>

Không stub:
- auth, capability, giới hạn gói, i18n

Cách nghiệm thu:
1. <bước bấm 1>
2. <bước bấm 2>
3. <kết quả kỳ vọng>
```

## 6. Chỉ dẫn cho AI Coding Agent

- Chỉ làm **một slice mỗi lần**. Không tự mở rộng phạm vi sang slice sau.
- Trước khi code: đọc [[AGENTS.md](http://AGENTS.md) — vlxd (Quản lý Vật liệu xây dựng)](https://app.notion.com/p/AGENTS-md-vlxd-Qu-n-l-V-t-li-u-x-y-d-ng-90aba91216c746d4ae12153ce6d0698a?pvs=21), trang này, và `AGENTS.md` con của thư mục sẽ sửa.
- Nếu thiếu quyết định, ghi câu hỏi vào `docs/decision-backlog.md` rồi chọn phương án tối giản, đánh dấu `TODO`.
- Nếu đổi API: sửa `contracts/http/openapi.yaml` trước, regenerate `packages/api-client`, không sửa code generated.
- Kết thúc slice: cập nhật mục Trạng thái slice bên dưới và mục Trạng thái tiến độ ở [AGENTS.md](http://AGENTS.md) gốc.
- Nếu một task ước lượng làm slice vỡ mốc 2–4 task, **dừng và đề xuất chẻ slice** thay vì làm tiếp.

## 7. Trạng thái slice

| Slice | Trạng thái | Demo bấm được | Stub còn nợ |
| --- | --- | --- | --- |
| 0 — Walking skeleton | Chưa bắt đầu | — | — |
| 1 — Đăng nhập | Chưa bắt đầu | — | — |
| 2 — Sản phẩm | Chưa bắt đầu | — | — |
| 3 — Kho & tồn | Chưa bắt đầu | — | — |
| 4 — Nhập kho | Chưa bắt đầu | — | — |
| 5 — Đơn hàng | Chưa bắt đầu | — | — |
| 6 — Phân quyền | Chưa bắt đầu | — | — |
| 7 — Thanh toán | Chưa bắt đầu | — | — |
| 8 — Báo cáo | Chưa bắt đầu | — | — |

### Nợ kỹ thuật tích lũy

- *… ghi từng stub kèm slice tạo ra nó và slice dự kiến xử lý …*

---

## 8. Quy trình thay đổi phạm vi (thêm / sửa / xóa tính năng)

<aside>
🔒

**Nguyên tắc gốc: số slice là ID bất biến.** Không bao giờ đánh số lại, không bao giờ dùng lại một số đã cấp. Mọi thay đổi phạm vi đều là **thêm dòng mới**, không phải viết lại quá khứ. Nhờ vậy commit, PR, migration và `TODO(slice-N)` trong code luôn trỏ đúng.

</aside>

### 8.1 Quy tắc đánh số

| Tình huống | Cách làm | Ví dụ |
| --- | --- | --- |
| Tính năng mới, làm sau cùng | Cấp số slice tiếp theo | Slice 9, Slice 10… |
| Tính năng mới phải chèn giữa | Dùng số thập phân, không đẩy các slice sau | Chèn giữa 4 và 5 → **Slice 4.5** |
| Slice quá to, cần chẻ | Giữ số gốc, thêm hậu tố chữ | Slice 5 → **5a**, **5b** |
| Thêm task vào slice **chưa bắt đầu** | Sửa trực tiếp bảng task | thêm 3.4 |
| Thêm task vào slice **đã xong** | Không sửa slice cũ. Tạo slice mới | Slice 2 xong → tạo **Slice 2.1 — Sản phẩm: sửa/xoá** |
| Bỏ tính năng chưa làm | Đổi trạng thái thành `Đã huỷ`, giữ nguyên dòng | Slice 8 → Đã huỷ |
| Bỏ tính năng đã code | Tạo slice gỡ bỏ riêng | **Slice 11 — Retire báo cáo cũ** |

### 8.2 Ba loại thay đổi và cách xử lý

**A. Thêm tính năng mới**

1. Viết slice mới theo **Mẫu mô tả slice** ở mục 5, đặt vào mục 4 đúng vị trí thứ tự mong muốn.
2. Thêm 1 dòng vào bảng **Trạng thái slice** (mục 7) với trạng thái `Chưa bắt đầu`.
3. Thêm 1 dòng vào **Sổ thay đổi phạm vi** (mục 8.5).
4. Nếu tính năng ảnh hưởng kiến trúc/nghiệp vụ gốc (quyền mới, module mới, gói dịch vụ mới) → cập nhật AGENTS.md gốc và ghi ADR.
5. Không chỉnh bất kỳ slice nào khác.

**B. Sửa tính năng đã có trong danh sách**

| Trạng thái slice | Được phép | Không được phép |
| --- | --- | --- |
| Chưa bắt đầu | Sửa tự do task, thêm/bỏ task, đổi thứ tự | Đổi số slice |
| Đang làm | Chỉ sửa task **chưa code**; ghi lý do vào sổ thay đổi | Mở rộng quá 4 task → phải chuyển sang slice mới |
| Đã xong | Giữ nguyên bảng task như **lịch sử** | Sửa lại nội dung task đã ship |

Slice đã xong mà cần sửa → tạo **slice sửa** với tiêu đề rõ ràng và dòng `Thay đổi slice gốc: Slice N`. Slice sửa cũng phải đủ 2–4 task và kết thúc bằng màn hình bấm được.

**C. Xóa tính năng**

- **Chưa code:** đổi trạng thái `Đã huỷ` + ghi lý do. Không xoá dòng khỏi tài liệu để còn dấu vết quyết định.
- **Đã code:** tạo slice retire riêng, checklist bắt buộc:
    - [ ]  Xoá route UI + entry menu.
    - [ ]  Xoá endpoint khỏi `contracts/http/openapi.yaml`, regenerate api-client.
    - [ ]  Xoá feature folder (BE/FE) và các import qua `index.ts`.
    - [ ]  Xoá i18n key không còn dùng ở cả `vi` và `en`.
    - [ ]  Xoá capability không còn dùng (seed + bảng `capability`).
    - [ ]  **Không drop bảng dữ liệu nghiệp vụ** — đánh dấu deprecated, migration reversible, giữ dữ liệu lịch sử.
    - [ ]  Ghi ADR: lý do bỏ, dữ liệu cũ xử lý thế nào.

### 8.3 Checklist đánh giá ảnh hưởng (làm trước khi chấp nhận thay đổi)

Với mọi thay đổi phạm vi, trả lời 7 câu:

1. Có đổi **DB** không? Cần migration mới nào, có reversible không?
2. Có đổi **OpenAPI** không? Breaking change hay additive?
3. Có đổi **capability/quyền** không? Title nào bị ảnh hưởng?
4. Có đổi **giới hạn gói** không? Free/Standard/Premium/Enterprise khác gì?
5. Có **i18n key** mới/bỏ không? Đã có `vi` chưa?
6. Slice nào đang **phụ thuộc** vào phần bị sửa?
7. Có làm slice vỡ mốc **2–4 task** không? Nếu có → chẻ slice.

Nếu câu 1, 2, 3 hoặc 4 trả lời "có" → **bắt buộc ghi ADR** trong `docs/adr/`.

### 8.4 Trạng thái slice được phép dùng

| Trạng thái | Ý nghĩa |
| --- | --- |
| Chưa bắt đầu | Đã lên kế hoạch, chưa có code |
| Đang làm | Đã mở branch/PR |
| Xong | Đạt đủ Definition of Done ở mục 3 |
| Xong (còn stub) | Demo được nhưng còn nợ kỹ thuật đã ghi |
| Hoãn | Có giá trị nhưng lùi lịch, ghi lý do |
| Đã huỷ | Quyết định không làm, ghi lý do |
| Đã thay thế | Bị slice khác thay, ghi rõ slice thay thế |

### 8.5 Sổ thay đổi phạm vi (bắt buộc ghi, chỉ thêm dòng mới)

| Ngày | Loại | Slice liên quan | Nội dung thay đổi | Lý do | ADR |
| --- | --- | --- | --- | --- | --- |
| 2026-08-27 | Khởi tạo | 0–8 | Chốt lộ trình 9 slice ban đầu | Chuyển sang phương pháp lát cắt dọc | — |
| *…* | *Thêm / Sửa / Huỷ / Hoãn / Chẻ* | *…* | *…* | *…* | *…* |

### 8.6 Chỉ dẫn cho AI Coding Agent khi phạm vi đổi

- Trước khi code, **đọc bảng Trạng thái slice và Sổ thay đổi trước**, không dựa vào ký ức hay chat cũ.
- Chỉ làm slice ở trạng thái `Chưa bắt đầu` hoặc `Đang làm`. Slice `Đã huỷ`/`Đã thay thế` thì bỏ qua.
- Không tự ý đánh số lại, gộp hay xoá slice. Nếu thấy cần, **đề xuất** rồi chờ xác nhận.
- Khi hoàn thành slice: cập nhật bảng mục 7, mục Nợ kỹ thuật, và mục Trạng thái tiến độ ở AGENTS.md gốc — trong cùng PR.
- Khi được yêu cầu thêm/bỏ tính năng: cập nhật tài liệu trước (slice + bảng trạng thái + sổ thay đổi), **sau đó mới code**.