import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import { useCreateUser, useTitles, useUsers } from "../api/useUsers.js";

export function UsersPage() {
  const { t } = useTranslation();
  const { data: usersData, isLoading: usersLoading, error: usersError } = useUsers();
  const { data: titlesData } = useTitles();
  const createUserMutation = useCreateUser();

  const [openDialog, setOpenDialog] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [titleId, setTitleId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleOpenDialog = () => {
    setFullName("");
    setEmail("");
    setPassword("");
    setTitleId(titlesData?.items[0]?.id ?? "");
    setFormError(null);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError(t("users.errorNameRequired", "Vui lòng nhập họ tên"));
      return;
    }
    if (!email.trim()) {
      setFormError(t("users.errorEmailRequired", "Vui lòng nhập email"));
      return;
    }
    if (password.length < 6) {
      setFormError(t("users.errorPasswordLength", "Mật khẩu phải từ 6 ký tự"));
      return;
    }
    const selectedTitleId = titleId || titles[0]?.id || "";
    if (!selectedTitleId) {
      setFormError(t("users.errorTitleRequired", "Vui lòng chọn chức danh"));
      return;
    }

    try {
      await createUserMutation.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        titleId: selectedTitleId,
      });
      setOpenDialog(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "EMAIL_EXISTS") {
        setFormError(t("users.errorEmailExists", "Email này đã được sử dụng"));
      } else {
        setFormError(t("users.errorCreateFailed", "Không thể tạo tài khoản nhân viên"));
      }
    }
  };

  if (usersLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (usersError) {
    const isForbidden = usersError.message === "FORBIDDEN";
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {isForbidden
            ? t("users.forbidden", "Bạn không có quyền truy cập trang quản lý người dùng")
            : t("users.errorLoading", "Lỗi khi tải danh sách người dùng")}
        </Alert>
      </Box>
    );
  }

  const users = usersData?.items ?? [];
  const titles = titlesData?.items ?? [];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight="bold">
          {t("users.title", "Quản lý nhân viên")}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          onClick={handleOpenDialog}
          data-testid="add-user-btn"
        >
          {t("users.addButton", "Thêm nhân viên")}
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={1}>
        <Table aria-label="users table">
          <TableHead sx={{ backgroundColor: "grey.100" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: "bold" }}>{t("users.fullName", "Họ và tên")}</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>{t("users.email", "Email")}</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>{t("users.roleTitle", "Chức danh")}</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>{t("users.status", "Trạng thái")}</TableCell>
              <TableCell sx={{ fontWeight: "bold" }}>{t("users.createdAt", "Ngày tạo")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: "medium" }}>{user.fullName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  {user.titles.map((titleName) => (
                    <Chip
                      key={titleName}
                      label={titleName}
                      size="small"
                      color={titleName.includes("Chủ") ? "primary" : "secondary"}
                      variant="outlined"
                      sx={{ mr: 0.5 }}
                    />
                  ))}
                </TableCell>
                <TableCell>
                  <Chip
                    label={
                      user.status === "active"
                        ? t("users.statusActive", "Hoạt động")
                        : t("users.statusInactive", "Đã khóa")
                    }
                    size="small"
                    color={user.status === "active" ? "success" : "default"}
                  />
                </TableCell>
                <TableCell>{new Date(user.createdAt).toLocaleDateString("vi-VN")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog Thêm nhân viên */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          component: "form",
          onSubmit: handleSubmit,
        }}
      >
        <DialogTitle sx={{ fontWeight: "bold" }}>
          {t("users.dialogTitle", "Thêm nhân viên mới")}
        </DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label={t("users.fullName", "Họ và tên")}
            fullWidth
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            inputProps={{ "data-testid": "user-fullname-input" }}
          />

          <TextField
            label={t("users.email", "Email")}
            type="email"
            fullWidth
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputProps={{ "data-testid": "user-email-input" }}
          />

          <TextField
            label={t("users.password", "Mật khẩu ban đầu")}
            type="password"
            fullWidth
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            helperText={t("users.passwordHelper", "Tối thiểu 6 ký tự")}
            inputProps={{ "data-testid": "user-password-input" }}
          />

          <FormControl fullWidth required>
            <InputLabel id="select-title-label">{t("users.roleTitle", "Chức danh")}</InputLabel>
            <Select
              labelId="select-title-label"
              value={titleId || titles[0]?.id || ""}
              label={t("users.roleTitle", "Chức danh")}
              onChange={(e) => setTitleId(e.target.value)}
              data-testid="user-title-select"
            >
              {titles.map((title) => (
                <MenuItem key={title.id} value={title.id}>
                  {title.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseDialog} disabled={createUserMutation.isPending}>
            {t("common.cancel", "Hủy")}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createUserMutation.isPending}
            data-testid="submit-user-btn"
          >
            {createUserMutation.isPending
              ? t("common.saving", "Đang lưu...")
              : t("common.save", "Lưu")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
