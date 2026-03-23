"use client";

import { summarizeWebsite } from "../app/actions";
import {
  AccountSettingsDialog,
  type AccountSettingsMode,
} from "./account-settings-dialog";
import { AuthDialog, type AuthMode } from "./auth-dialog";
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
import { useEffect, useState, type FormEvent, type MouseEvent } from "react";

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
  const [session, setSession] = useState<Session | null>(null);

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
    </Box>
  );
}
