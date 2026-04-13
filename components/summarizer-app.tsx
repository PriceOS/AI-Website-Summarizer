"use client";

import { summarizeWebsite } from "../app/actions";
import {
  AccountSettingsDialog,
  type AccountSettingsMode,
} from "./account-settings-dialog";
import { AuthDialog, type AuthMode } from "./auth-dialog";
import { BillingDialog } from "./billing-dialog";
import {
  BILLING_PROFILE_SELECT_COLUMNS,
  serializeBillingProfile,
  getDefaultBillingProfile,
  type BillingProfileRow,
} from "@/lib/billing/format";
import type { BillingInterval, BillingProfile, PlanKey } from "@/lib/billing/types";
import {
  getSupabaseBrowserClient,
  getSupabaseConfigError,
} from "../lib/supabase/client";
import { readStreamableValue } from "@ai-sdk/rsc";
import AppBar from "@mui/material/AppBar";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import type { Session } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";

type BillingActionResponse = {
  error?: string;
  mode?: "noop" | "redirect" | "scheduled" | "updated";
  profile?: BillingProfile;
  url?: string;
};

export function SummarizerApp() {
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<HTMLElement | null>(null);
  const [accountSettingsMode, setAccountSettingsMode] = useState<AccountSettingsMode>("email");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [authDialogMode, setAuthDialogMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authConfigError, setAuthConfigError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [billingProfile, setBillingProfile] = useState<BillingProfile>(getDefaultBillingProfile());
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingNotice, setBillingNotice] = useState("");
  const [billingNoticeSeverity, setBillingNoticeSeverity] = useState<"info" | "success">("info");
  const [isBillingSubmitting, setIsBillingSubmitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const configError = getSupabaseConfigError();

    setAuthConfigError(configError);

    if (configError) {
      setIsAuthLoading(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let isMounted = true;

    void supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!isMounted) {
          return;
        }

        if (sessionError) {
          setAuthError(sessionError.message);
        }

        setSession(data.session ?? null);
        setIsAuthLoading(false);
      })
      .catch((caughtError) => {
        if (!isMounted) {
          return;
        }

        setAuthError(
          caughtError instanceof Error ? caughtError.message : "Unable to load the current session.",
        );
        setIsAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setAuthError("");
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshBillingProfile = useEffectEvent(async (activeSession: Session | null) => {
    if (!activeSession) {
      setBillingProfile(getDefaultBillingProfile());
      return;
    }

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: billingProfileError } = await supabase
        .from("billing_profiles")
        .select(BILLING_PROFILE_SELECT_COLUMNS)
        .eq("user_id", activeSession.user.id)
        .maybeSingle();

      if (billingProfileError) {
        throw billingProfileError;
      }

      setBillingProfile(serializeBillingProfile(data as BillingProfileRow | null));
    } catch (caughtError) {
      setAuthError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load the current billing profile.",
      );
    }
  });

  useEffect(() => {
    void refreshBillingProfile(session);
  }, [session]);

  useEffect(() => {
    const billingState = searchParams.get("billing");

    if (!session || !billingState) {
      return;
    }

    if (billingState === "cancelled") {
      setBillingNotice("Stripe Checkout was cancelled before any billing changes were applied.");
      setBillingNoticeSeverity("info");
      return;
    }

    if (billingState !== "success") {
      return;
    }

    setBillingNotice("Finalizing your subscription. This page will refresh your plan state shortly.");
    setBillingNoticeSeverity("success");

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      void refreshBillingProfile(session);

      if (attempts >= 5) {
        window.clearInterval(interval);
      }
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, [searchParams, session]);

  const openAuthDialog = (mode: AuthMode) => {
    setAuthError("");
    setAuthDialogMode(mode);
    setAuthDialogOpen(true);
  };

  const handleAccountMenuOpen = (event: MouseEvent<HTMLElement>) => {
    setAccountMenuAnchor(event.currentTarget);
  };

  const handleAccountMenuClose = () => {
    setAccountMenuAnchor(null);
  };

  const handleOpenAccountSettings = (mode: AccountSettingsMode) => {
    setAuthError("");
    setAccountSettingsMode(mode);
    setAccountSettingsOpen(true);
    handleAccountMenuClose();
  };

  const handleOpenBillingDialog = () => {
    setBillingError("");
    setBillingDialogOpen(true);
    handleAccountMenuClose();
  };

  const handleBillingPlanSelection = async (planKey: PlanKey, billingInterval: BillingInterval) => {
    setBillingError("");
    setIsBillingSubmitting(true);

    try {
      const response = await fetch("/api/billing/subscribe", {
        body: JSON.stringify({
          billingInterval,
          planKey,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as BillingActionResponse;

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? "Unable to update the billing plan.");
      }

      if (payload.mode === "redirect" && payload.url) {
        window.location.assign(payload.url);
        return;
      }

      if (payload.profile) {
        setBillingProfile(payload.profile);
      }

      setBillingNotice(
        payload.mode === "scheduled"
          ? "Your plan change has been scheduled for the next renewal."
          : "Your billing plan has been updated.",
      );
      setBillingNoticeSeverity("success");
      setBillingDialogOpen(false);
    } catch (caughtError) {
      setBillingError(
        caughtError instanceof Error ? caughtError.message : "Unable to update the billing plan.",
      );
    } finally {
      setIsBillingSubmitting(false);
    }
  };

  const handleOpenCustomerPortal = async () => {
    setBillingError("");
    handleAccountMenuClose();
    setIsBillingSubmitting(true);

    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; url?: string };

      if (!response.ok || payload.error || !payload.url) {
        throw new Error(payload.error ?? "Unable to open the Stripe customer portal.");
      }

      window.location.assign(payload.url);
    } catch (caughtError) {
      setBillingError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to open the Stripe customer portal.",
      );
    } finally {
      setIsBillingSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError("");
    handleAccountMenuClose();

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      setError("");
      setSummary("");
      setUrl("");
      setBillingDialogOpen(false);
      setBillingError("");
      setBillingNotice("");
      setBillingProfile(getDefaultBillingProfile());
      setAccountSettingsOpen(false);
    } catch (caughtError) {
      setAuthError(caughtError instanceof Error ? caughtError.message : "Unable to log out.");
    }
  };

  const avatarLabel = session?.user.email?.trim().charAt(0).toUpperCase() ?? "U";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!session) {
      setError("Log in to summarize websites.");
      return;
    }

    setIsLoading(true);
    setError("");
    setSummary("");

    try {
      const stream = await summarizeWebsite(url);
      let nextSummary = "";

      for await (const delta of readStreamableValue(stream)) {
        nextSummary += delta;
        setSummary(nextSummary);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar
        color="transparent"
        elevation={0}
        position="sticky"
        sx={{
          backdropFilter: "blur(12px)",
          backgroundColor: "rgba(244, 247, 251, 0.88)",
          borderBottom: "1px solid rgba(21, 101, 192, 0.10)",
        }}
      >
        <Toolbar sx={{ gap: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography fontWeight={800} variant="h6">
              AI Website Summarizer
            </Typography>
          </Box>

          {isAuthLoading ? (
            <CircularProgress size={24} />
          ) : session ? (
            <>
              {!billingProfile.isPaid ? (
                <Button onClick={handleOpenBillingDialog} variant="contained">
                  Upgrade
                </Button>
              ) : null}
              <IconButton onClick={handleAccountMenuOpen} size="small">
                <Avatar sx={{ bgcolor: "primary.main", height: 36, width: 36 }}>
                  {avatarLabel}
                </Avatar>
              </IconButton>
              <Menu
                anchorEl={accountMenuAnchor}
                onClose={handleAccountMenuClose}
                open={Boolean(accountMenuAnchor)}
              >
                <MenuItem disabled>{session.user.email ?? "Signed in"}</MenuItem>
                <MenuItem onClick={handleOpenBillingDialog}>
                  {billingProfile.isPaid ? "Billing" : "Upgrade"}
                </MenuItem>
                {billingProfile.isPaid ? (
                  <MenuItem onClick={handleOpenCustomerPortal}>Payment Methods</MenuItem>
                ) : null}
                <MenuItem onClick={() => handleOpenAccountSettings("email")}>
                  Update Email
                </MenuItem>
                <MenuItem onClick={() => handleOpenAccountSettings("password")}>
                  Change Password
                </MenuItem>
                <MenuItem onClick={handleSignOut}>Log Out</MenuItem>
              </Menu>
            </>
          ) : (
            <Stack direction="row" spacing={1.5}>
              <Button
                disabled={Boolean(authConfigError)}
                onClick={() => openAuthDialog("login")}
                variant="text"
              >
                Log In
              </Button>
              <Button
                disabled={Boolean(authConfigError)}
                onClick={() => openAuthDialog("signup")}
                variant="contained"
              >
                Sign Up
              </Button>
            </Stack>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={3}>
          {authConfigError ? <Alert severity="warning">{authConfigError}</Alert> : null}
          {authError ? <Alert severity="error">{authError}</Alert> : null}
          {billingNotice ? (
            <Alert onClose={() => setBillingNotice("")} severity={billingNoticeSeverity}>
              {billingNotice}
            </Alert>
          ) : null}

          <Paper
            elevation={0}
            sx={{
              border: "1px solid rgba(21, 101, 192, 0.12)",
              p: { xs: 3, md: 4 },
            }}
          >
            <Stack component="form" onSubmit={handleSubmit} spacing={3}>
              <Box>
                <Typography component="h1" fontWeight={700} gutterBottom variant="h4">
                  Summarize any webpage
                </Typography>
                <Typography color="text.secondary">
                  Paste a webpage URL and get a concise streamed summary powered by OpenAI.
                </Typography>
              </Box>

              <TextField
                fullWidth
                disabled={isLoading || !session}
                label="Website URL"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                required
                type="url"
                value={url}
              />

              <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                <Button
                  disabled={isLoading || !session}
                  size="large"
                  type="submit"
                  variant="contained"
                >
                  {isLoading ? "Summarizing..." : "Summarize"}
                </Button>
              </Box>
            </Stack>
          </Paper>

          <Card sx={{ minHeight: 240 }}>
            <CardContent>
              <Stack spacing={2}>
                <Typography fontWeight={600} variant="h6">
                  Summary
                </Typography>

                {error ? <Alert severity="error">{error}</Alert> : null}

                {!error && !summary && !isLoading ? (
                  <Typography color="text.secondary">
                    {authConfigError
                      ? "Add the Supabase environment variables to enable authentication."
                      : session
                        ? "The streamed summary will appear here after you submit a URL."
                        : "Log in to unlock streamed website summaries."}
                  </Typography>
                ) : null}

                {isLoading && !summary ? (
                  <Box sx={{ alignItems: "center", display: "flex", gap: 1.5 }}>
                    <CircularProgress size={20} />
                    <Typography color="text.secondary">Fetching and summarizing...</Typography>
                  </Box>
                ) : null}

                {summary ? (
                  <Typography
                    component="pre"
                    sx={{
                      fontFamily: "inherit",
                      m: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {summary}
                  </Typography>
                ) : null}
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>

      <AuthDialog
        mode={authDialogMode}
        onClose={() => setAuthDialogOpen(false)}
        onModeChange={setAuthDialogMode}
        open={authDialogOpen}
      />
      <AccountSettingsDialog
        currentEmail={session?.user.email ?? ""}
        mode={accountSettingsMode}
        onClose={() => setAccountSettingsOpen(false)}
        open={accountSettingsOpen}
      />
      {billingDialogOpen ? (
        <BillingDialog
          billingProfile={billingProfile}
          error={billingError}
          isSubmitting={isBillingSubmitting}
          onClose={() => setBillingDialogOpen(false)}
          onOpenPortal={handleOpenCustomerPortal}
          onSelectPlan={handleBillingPlanSelection}
          open={billingDialogOpen}
        />
      ) : null}
    </Box>
  );
}
