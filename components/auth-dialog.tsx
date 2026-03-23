"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, type FormEvent } from "react";

export type AuthMode = "login" | "signup";

type AuthDialogProps = {
  mode: AuthMode;
  onClose: () => void;
  onModeChange: (mode: AuthMode) => void;
  open: boolean;
};

const authCopy: Record<
  AuthMode,
  {
    submitLabel: string;
    title: string;
  }
> = {
  login: {
    submitLabel: "Log In",
    title: "Welcome back",
  },
  signup: {
    submitLabel: "Create Account",
    title: "Create your account",
  },
};

export function AuthDialog({ mode, onClose, onModeChange, open }: AuthDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setPassword("");
      setError("");
      setIsSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const normalizedEmail = email.trim();

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        onClose();
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.session) {
        onClose();
        return;
      }

      const { error: postSignUpSignInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (postSignUpSignInError) {
        if (/email.*confirm/i.test(postSignUpSignInError.message)) {
          throw new Error(
            "Your Supabase project is still requiring email confirmation. Disable Confirm email under Authentication > Providers > Email, then try again.",
          );
        }

        throw postSignUpSignInError;
      }

      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to authenticate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copy = authCopy[mode];
  const alternateMode = mode === "login" ? "signup" : "login";
  const alternateLabel =
    mode === "login" ? "Need an account? Sign Up" : "Already have an account? Log In";

  return (
    <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
      <DialogTitle sx={{ pb: 1 }}>{copy.title}</DialogTitle>
      <DialogContent sx={{ pb: 3, pt: 2 }}>
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stack component="form" onSubmit={handleSubmit} spacing={2} sx={{ pt: 1 }}>
            <TextField
              autoComplete="email"
              autoFocus
              label="Email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              helperText={mode === "signup" ? "Use at least 6 characters." : " "}
              inputProps={{ minLength: 6 }}
              label="Password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />

            <Button disabled={isSubmitting} size="large" type="submit" variant="contained">
              {isSubmitting ? "Working..." : copy.submitLabel}
            </Button>

            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Button
                onClick={() => {
                  setError("");
                  onModeChange(alternateMode);
                }}
                size="small"
                sx={{ alignSelf: "center" }}
              >
                {alternateLabel}
              </Button>
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
