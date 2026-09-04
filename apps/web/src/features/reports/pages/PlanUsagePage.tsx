import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Grid,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import WarehouseIcon from "@mui/icons-material/Warehouse";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import PeopleIcon from "@mui/icons-material/People";
import WorkspacePremiumIcon from "@mui/icons-material/WorkspacePremium";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { usePlanUsage } from "../api/useReports.js";

export function PlanUsagePage() {
  const { t } = useTranslation();
  const usageQuery = usePlanUsage();

  const data = usageQuery.data;
  const productUsage = data?.usage.products ?? 0;
  const productLimit = data?.limits.products ?? null;
  const isProductUnlimited = productLimit === null;
  const productPercent = isProductUnlimited
    ? 0
    : Math.min(100, Math.round((productUsage / (productLimit || 1)) * 100));

  const warehouseUsage = data?.usage.warehouses ?? 0;
  const warehouseLimit = data?.limits.warehouses ?? null;
  const isWarehouseUnlimited = warehouseLimit === null;
  const warehousePercent = isWarehouseUnlimited
    ? 0
    : Math.min(100, Math.round((warehouseUsage / (warehouseLimit || 1)) * 100));

  return (
    <>
      <AppHeader />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={2}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Button
                component={RouterLink}
                to="/"
                startIcon={<ArrowBackIcon />}
                size="small"
                data-testid="plan-back-btn"
              >
                {t("reports.backToDashboard", "Bảng điều khiển")}
              </Button>
              <Typography variant="h5" component="h1" fontWeight={700}>
                {t("plan.title", "Hạn mức gói cước & Tài nguyên")}
              </Typography>
            </Stack>

            {data?.planName && (
              <Chip
                icon={<WorkspacePremiumIcon />}
                label={data.planName}
                color="primary"
                variant="filled"
                sx={{ fontWeight: 700, px: 1 }}
                data-testid="plan-tier-chip"
              />
            )}
          </Stack>

          {usageQuery.isError && (
            <Alert severity="error" data-testid="plan-usage-error-alert">
              {t("plan.loadError", "Không thể tải dữ liệu hạn mức gói cước.")}
            </Alert>
          )}

          {usageQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : usageQuery.isError ? null : (
            <>
              {/* Product Quota Card */}
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Inventory2Icon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                          {t("plan.productsQuota", "Danh mục sản phẩm")}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        color={
                          !isProductUnlimited && productPercent >= 90
                            ? "error.main"
                            : "text.primary"
                        }
                        data-testid="plan-product-ratio"
                      >
                        {isProductUnlimited
                          ? `${productUsage} / ${t("plan.unlimited", "Không giới hạn")}`
                          : `${productUsage} / ${productLimit} (${productPercent}%)`}
                      </Typography>
                    </Stack>

                    {!isProductUnlimited && (
                      <LinearProgress
                        variant="determinate"
                        value={productPercent}
                        color={
                          productPercent >= 90
                            ? "error"
                            : productPercent >= 70
                              ? "warning"
                              : "primary"
                        }
                        sx={{ height: 10, borderRadius: 5 }}
                        data-testid="plan-usage-product-progress"
                      />
                    )}

                    {!isProductUnlimited && productPercent >= 100 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        {t(
                          "plan.productLimitReached",
                          "Bạn đã đạt mức giới hạn 80 sản phẩm của gói Free. Hãy liên hệ quản trị viên để mở rộng.",
                        )}
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              {/* Warehouse Quota Card */}
              <Card variant="outlined">
                <CardContent>
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <WarehouseIcon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                          {t("plan.warehousesQuota", "Số lượng kho hàng")}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="subtitle1"
                        fontWeight={700}
                        color={
                          !isWarehouseUnlimited && warehousePercent >= 90
                            ? "error.main"
                            : "text.primary"
                        }
                        data-testid="plan-warehouse-ratio"
                      >
                        {isWarehouseUnlimited
                          ? `${warehouseUsage} / ${t("plan.unlimited", "Không giới hạn")}`
                          : `${warehouseUsage} / ${warehouseLimit} (${warehousePercent}%)`}
                      </Typography>
                    </Stack>

                    {!isWarehouseUnlimited && (
                      <LinearProgress
                        variant="determinate"
                        value={warehousePercent}
                        color={
                          warehousePercent >= 90
                            ? "error"
                            : warehousePercent >= 70
                              ? "warning"
                              : "primary"
                        }
                        sx={{ height: 10, borderRadius: 5 }}
                        data-testid="plan-usage-warehouse-progress"
                      />
                    )}

                    {!isWarehouseUnlimited && warehousePercent >= 100 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        {t(
                          "plan.warehouseLimitReached",
                          "Bạn đã đạt mức giới hạn 3 kho của gói Free. Hãy liên hệ quản trị viên để mở rộng.",
                        )}
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              {/* Other Resources Statistics */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <ShoppingCartIcon color="action" sx={{ fontSize: 40 }} />
                        <Box>
                          <Typography color="text.secondary" variant="body2">
                            {t("plan.ordersCreated", "Đơn hàng đã lập")}
                          </Typography>
                          <Typography variant="h5" fontWeight={700} data-testid="plan-orders-count">
                            {data?.usage.orders ?? 0}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t("plan.unlimited", "Không giới hạn")}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <PeopleIcon color="action" sx={{ fontSize: 40 }} />
                        <Box>
                          <Typography color="text.secondary" variant="body2">
                            {t("plan.usersActive", "Tài khoản nhân viên")}
                          </Typography>
                          <Typography variant="h5" fontWeight={700} data-testid="plan-users-count">
                            {data?.usage.users ?? 0}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {t("plan.unlimited", "Không giới hạn")}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Upgrade Info Card */}
              {data?.plan === "free" ? (
                <Card
                  sx={{ bgcolor: "info.50", borderColor: "info.200" }}
                  variant="outlined"
                  data-testid="plan-upgrade-card"
                >
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={700} color="info.dark" gutterBottom>
                      {t("plan.upgradeTitle", "Nâng cấp gói cước Doanh Nghiệp")}
                    </Typography>
                    <Typography variant="body2" color="info.dark">
                      {t(
                        "plan.upgradeDesc",
                        "Gói Miễn phí (Free) được thiết kế cho các cửa hàng vật liệu xây dựng quy mô khởi đầu. Khi quy mô của bạn mở rộng vượt quá 80 sản phẩm hoặc 3 chi nhánh kho, vui lòng liên hệ đội ngũ hỗ trợ để nâng cấp gói không giới hạn.",
                      )}
                    </Typography>
                  </CardContent>
                </Card>
              ) : (
                <Card
                  sx={{ bgcolor: "success.50", borderColor: "success.200" }}
                  variant="outlined"
                  data-testid="plan-unlimited-card"
                >
                  <CardContent>
                    <Typography
                      variant="subtitle1"
                      fontWeight={700}
                      color="success.dark"
                      gutterBottom
                    >
                      {data?.plan === "pro"
                        ? t("plan.proActiveTitle", "Gói Nâng cao (Pro) đang hoạt động")
                        : t("plan.unlimitedActiveTitle", "Gói cước không giới hạn đang hoạt động")}
                    </Typography>
                    <Typography variant="body2" color="success.dark">
                      {data?.plan === "pro"
                        ? t(
                            "plan.proActiveDesc",
                            "Cửa hàng của bạn đang sử dụng gói Pro với không giới hạn sản phẩm và kho hàng. Cảm ơn bạn đã tin tưởng đồng hành cùng chúng tôi!",
                          )
                        : t(
                            "plan.unlimitedActiveDesc",
                            "Cửa hàng của bạn đang sử dụng gói cước nâng cao với tài nguyên sản phẩm và kho hàng không giới hạn.",
                          )}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}
