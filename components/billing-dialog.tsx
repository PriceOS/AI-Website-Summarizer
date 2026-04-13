"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { BILLING_PLANS, getPlanChangeKind, getPlanDefinition } from "@/lib/billing/plans";
import type { BillingInterval, BillingProfile, PlanKey } from "@/lib/billing/types";

type BillingDialogProps = {
  billingProfile: BillingProfile;
  error: string;
  isSubmitting: boolean;
  onClose: () => void;
  onOpenPortal: () => void;
  onSelectPlan: (planKey: PlanKey, billingInterval: BillingInterval) => void;
  open: boolean;
};

function formatRenewalDate(dateString: string | null) {
  if (!dateString) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(dateString));
}

export function BillingDialog({
  billingProfile,
  error,
  isSubmitting,
  onClose,
  onOpenPortal,
  onSelectPlan,
  open,
}: BillingDialogProps) {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(billingProfile.billingInterval);
  const renewalDate = formatRenewalDate(billingProfile.currentPeriodEnd);

  const pendingSummary = useMemo(() => {
    if (!billingProfile.pendingPlanKey || !billingProfile.pendingBillingInterval) {
      return "";
    }

    const pendingPlan = getPlanDefinition(billingProfile.pendingPlanKey);

    if (billingProfile.pendingPlanKey === "free") {
      return renewalDate
        ? `Your paid plan will end on ${renewalDate} and return to Free.`
        : "Your paid plan will end at the close of the current billing period.";
    }

    return renewalDate
      ? `${pendingPlan.name} (${billingProfile.pendingBillingInterval}) is scheduled to start on ${renewalDate}.`
      : `${pendingPlan.name} (${billingProfile.pendingBillingInterval}) is scheduled for the next renewal.`;
  }, [
    billingProfile.pendingBillingInterval,
    billingProfile.pendingPlanKey,
    renewalDate,
  ]);

  return (
    <Dialog fullWidth maxWidth="lg" onClose={onClose} open={open}>
      <DialogTitle>Plans and billing</DialogTitle>
      <DialogContent sx={{ pb: 4, pt: 2 }}>
        <Stack spacing={3}>
          {billingProfile.isPaid ? (
            <Alert severity="info">
              {billingProfile.cancelAtPeriodEnd
                ? pendingSummary
                : renewalDate
                  ? `Your ${getPlanDefinition(billingProfile.planKey).name} plan renews on ${renewalDate}.`
                  : `You are currently on the ${getPlanDefinition(billingProfile.planKey).name} plan.`}
            </Alert>
          ) : (
            <Alert severity="info">
              You are on the Free plan with {billingProfile.monthlyCredits} credits each month.
            </Alert>
          )}

          {pendingSummary && !billingProfile.cancelAtPeriodEnd ? (
            <Alert severity="success">{pendingSummary}</Alert>
          ) : null}

          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack
            direction={{ md: "row", xs: "column" }}
            spacing={2}
            sx={{
              alignItems: { md: "center", xs: "center" },
              justifyContent: "space-between",
            }}
          >
            <ToggleButtonGroup
              color="primary"
              exclusive
              onChange={(_event, value: BillingInterval | null) => {
                if (value) {
                  setBillingInterval(value);
                }
              }}
              sx={{
                alignSelf: "center",
                "& .MuiToggleButton-root": {
                  borderRadius: 1,
                  px: 3,
                },
              }}
              value={billingInterval}
            >
              <ToggleButton value="month">Monthly</ToggleButton>
              <ToggleButton value="year">Yearly</ToggleButton>
            </ToggleButtonGroup>

            {billingProfile.isPaid ? (
              <Button disabled={isSubmitting} onClick={onOpenPortal} variant="text">
                Open Customer Portal
              </Button>
            ) : null}
          </Stack>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                lg: "repeat(4, minmax(0, 1fr))",
                md: "repeat(2, minmax(0, 1fr))",
                xs: "1fr",
              },
            }}
          >
            {BILLING_PLANS.map((plan) => {
              const isCurrentPlan =
                billingProfile.planKey === plan.key &&
                (plan.key === "free" || billingProfile.billingInterval === billingInterval);
              const isPendingPlan =
                billingProfile.pendingPlanKey === plan.key &&
                (plan.key === "free" || billingProfile.pendingBillingInterval === billingInterval);
              const planChangeKind = getPlanChangeKind(billingProfile.planKey, plan.key);
              let actionLabel = "Choose plan";

              if (isCurrentPlan) {
                actionLabel = "Current plan";
              } else if (isPendingPlan) {
                actionLabel = "Scheduled";
              } else if (plan.key === "free" && billingProfile.isPaid) {
                actionLabel = "End at renewal";
              } else if (!billingProfile.isPaid && plan.key !== "free") {
                actionLabel = "Subscribe";
              } else if (billingProfile.isPaid && planChangeKind === "upgrade") {
                actionLabel = "Upgrade now";
              } else {
                actionLabel = "Switch at renewal";
              }

              return (
                <Card
                  key={plan.key}
                  sx={{
                    borderColor: plan.key === "pro" ? "primary.main" : "divider",
                    borderRadius: 1,
                    borderWidth: plan.key === "pro" ? 2 : 1,
                    borderStyle: "solid",
                    display: "flex",
                  }}
                  variant="outlined"
                >
                  <CardContent sx={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography fontWeight={700} variant="h6">
                        {plan.name}
                      </Typography>
                      {plan.key === "pro" ? <Chip color="primary" label="Popular" size="small" /> : null}
                    </Stack>

                    <Box>
                      <Typography fontWeight={800} variant="h4">
                        {plan.billingCopy[billingInterval].split(" / ")[0]}
                      </Typography>
                      <Typography color="text.secondary">
                        {billingInterval === "year" ? "Billed annually" : "Billed monthly"}
                      </Typography>
                    </Box>

                    <Stack spacing={1}>
                      <Typography>{plan.monthlyCredits} credits per month</Typography>
                    </Stack>

                    <Box sx={{ mt: "auto" }}>
                      <Button
                        disabled={isSubmitting || isCurrentPlan || isPendingPlan}
                        fullWidth
                        onClick={() => onSelectPlan(plan.key, billingInterval)}
                        variant={plan.key === "pro" ? "contained" : "outlined"}
                      >
                        {actionLabel}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
