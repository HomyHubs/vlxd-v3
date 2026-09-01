# Lát cắt dọc (Vertical Slice) — Profile phương pháp triển khai (GỐC)

<aside>
🪚

Profile phương pháp triển khai dùng chung cho mọi dự án. Đây là **phần bổ sung** cho `AGENTS.md` gốc, không thay thế nó. Khi xung đột về **thứ tự triển khai**, trang này thắng. Khi xung đột về **kiến trúc, bảo mật, contract, cổng gác**, `AGENTS.md` gốc thắng.

</aside>

<aside>
📌

Cách dùng: copy nội dung dưới thành `docs/vertical-slice.md` trong repo, hoặc dán trực tiếp vào `AGENTS.md` gốc như một mục con. Điền phần **Lộ trình slice** theo dự án cụ thể.

</aside>

## 1. Lát cắt dọc là gì

Một slice là **một luồng nhỏ nhưng đầy đủ từ đầu đến cuối**, đi xuyên qua toàn bộ hệ thống.

```
UI (nút bấm)  →  API nhận request  →  Service xử lý  →  DB lưu  →  UI hiện kết quả
```

Ví dụ: nút Đặt hàng → `POST /orders` → service tạo đơn (logic tối giản) → ghi 1 bản ghi → UI hiện "Đặt hàng thành công".

| Tiêu chí                   | Lát cắt ngang (tránh)                   | Lát cắt dọc (áp dụng)                  |
| -------------------------- | --------------------------------------- | -------------------------------------- |
| Cách chia việc             | Xong hết DB → xong hết API → mới làm UI | Mỗi lần một tính năng nhỏ, đủ mọi tầng |
| Khi nào thấy được sản phẩm | Rất muộn, gần cuối                      | Sau mỗi 2–4 task                       |
| Rủi ro tích hợp            | Dồn vào cuối, dễ vỡ                     | Trả nợ liên tục, phát hiện sớm         |
| Khả năng nghiệm thu        | Chỉ đọc code/test                       | Mở browser bấm thử được                |

---

## 2. Quy tắc bắt buộc

1. Mỗi slice tối đa **2–4 task**. Vượt mốc thì chẻ slice.
2. Mỗi slice phải kết thúc bằng **một màn hình bấm được** trên môi trường chạy thật (browser/CLI/endpoint có client gọi).
3. Cho phép **stub logic nghiệp vụ phức tạp**, nhưng phải đánh dấu `TODO(slice-N)` ngay tại chỗ và ghi vào mục Nợ kỹ thuật.
4. Nút bấm được phép chưa có logic đầy đủ; nhưng **không được** giả lập: xác thực/session, phân quyền, hạn mức thương mại, và chuỗi hiển thị đa ngôn ngữ nếu dự án có.
5. Không làm hết backend rồi mới làm frontend. Mỗi endpoint ra đời cùng UI gọi nó.
6. Slice **không được đổi kiến trúc** đã chốt. Muốn đổi thì làm ADR trước.
7. **Một slice là một PR.** PR nêu rõ: slice nào, bấm ở đâu để nghiệm thu, phần nào còn stub.

---

## 3. Definition of Done cho một slice

Mục này **cộng thêm** vào Definition of Done ở `AGENTS.md` gốc, không thay thế.

- [ ] Có đường đi hoàn chỉnh UI → API → service → DB → UI.
- [ ] Người dùng mở được màn hình và bấm được, thấy phản hồi thật (không phải mock ở frontend).
- [ ] Contract/spec API đã cập nhật trước khi code, client đã sinh lại nếu có.
- [ ] Input từ ngoài đã validate bằng schema.
- [ ] Xác thực và phân quyền enforce ở backend, không chỉ ẩn nút ở frontend.
- [ ] Migration mới đảo ngược được và đã test rollback.
- [ ] Có ít nhất 1 test cho luồng chính của slice.
- [ ] Toàn bộ cổng gác của repo xanh cả cục bộ và CI.
- [ ] Mọi stub đều có `TODO(slice-N)` và đã ghi vào Nợ kỹ thuật.
- [ ] Bảng Trạng thái slice đã cập nhật, đã commit.

---

## 4. Khung lộ trình slice (điền theo dự án)

<aside>
🧩

Thứ tự dưới đây là khung mặc định. Slice 0 luôn là **walking skeleton** — bắt buộc, không được bỏ qua, vì nó chứng minh toàn bộ đường ống chạy được trước khi làm nghiệp vụ.

</aside>

| Slice | Mục tiêu                                                                            | Kết quả bấm được                                    |
| ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0     | Walking skeleton: khởi tạo project, 1 endpoint sức khoẻ, 1 trang, 1 kết nối DB thật | Mở trang, bấm nút, thấy dữ liệu từ DB trả về        |
| 1     | Xác thực: đăng nhập/đăng xuất, session, trang được bảo vệ                           | Đăng nhập vào được, đăng xuất ra được               |
| 2     | Thực thể nghiệp vụ cốt lõi: danh sách + tạo mới                                     | Tạo 1 bản ghi và thấy nó trong danh sách            |
| 3     | Thực thể phụ thuộc thứ nhất                                                         | Tạo và xem được                                     |
| 4     | Luồng giao dịch chính (write nhiều bảng)                                            | Thực hiện giao dịch và thấy số liệu đổi             |
| 5     | Phân quyền: enforce theo vai trò, ẩn/chặn đúng chỗ                                  | Tài khoản quyền thấp bị chặn thật ở backend         |
| 6     | Báo cáo/tổng hợp tối giản                                                           | Mở trang báo cáo, thấy số đúng                      |
| 7+    | Trả nợ kỹ thuật: thay từng stub bằng logic thật                                     | Hành vi đầy đủ, không còn `TODO(slice-N)` trọng yếu |

---

## 5. Mẫu mô tả một slice

```markdown
### Slice N — <tên tính năng nhỏ>

**Mục tiêu bấm được:** <người dùng làm gì trên màn hình và thấy gì>
**Thay đổi mục gốc:** <để trống, hoặc ghi ID slice bị sửa>

| #   | Task | Tầng               | Ghi chú     |
| --- | ---- | ------------------ | ----------- |
| N.1 | ...  | DB / migration     | reversible  |
| N.2 | ...  | contract + backend | khớp spec   |
| N.3 | ...  | frontend           | route + nút |
| N.4 | ...  | test + tài liệu    |             |

**Stub cho phép:** <liệt kê + TODO(slice-N)>
**Không được stub:** xác thực, phân quyền, hạn mức, chuỗi hiển thị
**Cách nghiệm thu:** <mở URL nào, bấm gì, kỳ vọng thấy gì>
```

---

## 6. Bảng trạng thái slice (bộ nhớ chung — luôn cập nhật)

Dùng đúng bộ trạng thái ở mục 17.4 của `AGENTS.md` gốc.

| Slice | Tên              | Trạng thái   | PR  | Ghi chú / nợ kỹ thuật |
| ----- | ---------------- | ------------ | --- | --------------------- |
| 0     | Walking skeleton | Chưa bắt đầu | —   | —                     |

### Nợ kỹ thuật tích lũy

| Marker          | Vị trí      | Nội dung còn stub | Dự kiến trả ở slice |
| --------------- | ----------- | ----------------- | ------------------- |
| _TODO(slice-N)_ | _file:dòng_ | _…_               | _…_                 |

---

## 7. Chỉ dẫn cho AI Coding Agent

1. Đầu mỗi phiên: đọc `AGENTS.md` gốc → trang này → **bảng Trạng thái slice** → **Sổ thay đổi phạm vi**. Không dựa vào trí nhớ hay chat cũ.
2. Chỉ làm slice ở trạng thái `Chưa bắt đầu` hoặc `Đang làm`. Bỏ qua `Đã huỷ` và `Đã thay thế`.
3. Làm **đúng một slice mỗi lần**. Không gộp nhiều slice vào một PR.
4. Không tự ý đánh số lại, gộp, hay xoá slice — chỉ **đề xuất** rồi chờ xác nhận. Quy tắc đầy đủ ở mục 17 của `AGENTS.md` gốc.
5. Khi thêm/sửa/xoá tính năng: cập nhật tài liệu trước (slice → bảng trạng thái → sổ thay đổi → ADR nếu cần), sau đó mới code.
6. Khi xong slice: cập nhật bảng trạng thái + nợ kỹ thuật + Trạng thái tiến độ ở `AGENTS.md` gốc trong **cùng PR**.
7. Nếu một slice phình quá 4 task: dừng lại, đề xuất chẻ thành `Na`/`Nb`, không âm thầm làm tiếp.

---

## 8. Thêm / sửa / xóa tính năng giữa đường

<aside>
🔒

**Số slice là ID bất biến.** Không đánh số lại, không dùng lại số đã cấp, không xoá dòng slice. Mọi thay đổi phạm vi là **thêm dòng mới**, không viết lại quá khứ. Nhờ vậy commit, PR, tên migration và `TODO(slice-N)` trong code luôn trỏ đúng. Quy trình tổng quát đầy đủ ở mục 17 của `AGENTS.md` gốc; mục này là phần áp dụng riêng cho slice.

</aside>

### 8.1 Quy tắc đánh số slice khi phạm vi đổi

| Tình huống                           | Cách làm                                                                                                   | Ví dụ               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ------------------- |
| Tính năng mới, làm sau cùng          | Cấp số slice tiếp theo                                                                                     | Slice 8, Slice 9    |
| Tính năng mới phải chèn giữa         | Dùng số thập phân, không đẩy các slice sau                                                                 | Slice 3.5           |
| Slice vượt 4 task                    | Giữ số gốc, thêm hậu tố chữ                                                                                | Slice 4 → 4a, 4b    |
| Thêm/sửa task ở slice `Chưa bắt đầu` | Sửa trực tiếp bảng task của slice đó                                                                       | thêm task 3.4       |
| Thêm/sửa task ở slice `Đang làm`     | Chỉ sửa task **chưa code**; ghi lý do vào sổ thay đổi. Nếu vượt 4 task thì chuyển phần thêm sang slice mới | —                   |
| Thêm/sửa task ở slice `Xong`         | Giữ slice cũ nguyên vẹn làm lịch sử; tạo **slice sửa** riêng kèm dòng `Thay đổi mục gốc: Slice N`          | Slice 2 → Slice 2.1 |
| Bỏ tính năng chưa code               | Đổi trạng thái `Đã huỷ` • ghi lý do, giữ nguyên dòng trong bảng                                            | —                   |
| Bỏ tính năng đã code                 | Tạo **slice retire** riêng với checklist gỡ bỏ; slice gốc chuyển `Đã thay thế`                             | Slice 10 — Retire X |

### 8.2 Ba loại thay đổi

**A. Thêm tính năng** — 5 bước, không chạm slice nào khác:

1. Viết slice mới theo mẫu ở mục 5, chia đúng 2–4 task, phải có mục tiêu bấm được.
2. Thêm 1 dòng vào bảng Trạng thái slice (mục 6) với trạng thái `Chưa bắt đầu`.
3. Thêm 1 dòng vào Sổ thay đổi phạm vi (mục 8.4).
4. Nếu chạm kiến trúc, phân quyền, hạn mức hoặc schema → ghi ADR.
5. Không sửa nội dung các slice đã có.

**B. Sửa tính năng đã có trong danh sách task**

| Trạng thái slice | Được phép                                   | Không được phép                           |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Chưa bắt đầu     | Sửa tự do nội dung task, thêm/bỏ/đổi thứ tự | Đổi số slice                              |
| Đang làm         | Sửa task chưa code, ghi lý do               | Mở rộng vượt 4 task, đổi contract đã chốt |
| Xong             | Tạo slice sửa mới trỏ về slice gốc          | Sửa lại bảng task đã ship (đó là lịch sử) |

**C. Xóa tính năng**

- **Chưa code:** đổi trạng thái `Đã huỷ` + ghi lý do. Không xoá dòng.
- **Đã code:** tạo slice retire, checklist bắt buộc:
  - [ ] Xoá route/menu dẫn vào tính năng ở frontend.
  - [ ] Xoá endpoint khỏi spec API, sinh lại client.
  - [ ] Xoá module BE/FE và import trong điểm ghép, kiểm tra không còn ràng buộc.
  - [ ] Xoá quyền, feature flag, cấu hình và chuỗi hiển thị không còn dùng.
  - [ ] **Không drop bảng dữ liệu nghiệp vụ** — đánh dấu deprecated, migration đảo ngược được, giữ dữ liệu lịch sử.
  - [ ] Xoá `TODO(slice-N)` của slice bị bỏ khỏi bảng Nợ kỹ thuật.
  - [ ] Ghi ADR: lý do bỏ và cách xử lý dữ liệu cũ.

### 8.3 Checklist đánh giá ảnh hưởng (làm trước khi chấp nhận)

1. Có đổi **schema/migration** không? Đảo ngược được không?
2. Có đổi **contract API** không? Phá vỡ hay chỉ thêm?
3. Có đổi **quyền/phân quyền** không? Ai bị ảnh hưởng?
4. Có đổi **hạn mức hoặc điều khoản thương mại** không?
5. Có chuỗi hiển thị hoặc tài liệu nào cần thêm/bỏ không?
6. **Slice nào đang phụ thuộc** vào phần bị sửa? Ghi rõ vào sổ thay đổi.
7. Có làm slice vỡ mốc **2–4 task** không? Nếu có thì chẻ slice.

Nếu câu 1, 2, 3 hoặc 4 trả lời "có" → **bắt buộc ghi ADR**.

### 8.4 Sổ thay đổi phạm vi (chỉ thêm dòng mới, không sửa dòng cũ)

| Ngày | Loại                                       | Slice liên quan | Nội dung thay đổi | Lý do | ADR |
| ---- | ------------------------------------------ | --------------- | ----------------- | ----- | --- |
| _…_  | _Thêm / Sửa / Huỷ / Hoãn / Chẻ / Thay thế_ | _…_             | _…_               | _…_   | _…_ |

### 8.5 Thứ tự thao tác bắt buộc

1. Cập nhật tài liệu trước: slice mới/sửa → bảng Trạng thái slice → Sổ thay đổi phạm vi → ADR nếu cần.
2. Sau đó mới code, và chỉ code trong phạm vi đã ghi.
3. Trong cùng PR: cập nhật trạng thái slice, Nợ kỹ thuật, và Trạng thái tiến độ ở `AGENTS.md` gốc.
