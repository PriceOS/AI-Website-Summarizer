"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, type FormEvent } from "react";

export type AccountSettingsMode = "email" | "password";

type AccountSettingsDialogProps = {
  currentEmail: string;
  mode: AccountSettingsMode;
  onClose: () => void;
  open: boolean;
};

const dialogCopy: Record<
  AccountSettingsMode,
  {
    actionLabel: string;
    title: string;
  }
> = {
  email: {
    actionLabel: "Update Email",
    title: "Update your email",
  },
  password: {
    actionLabel: "Change Password",
    title: "Change your password",
  },
};

export function AccountSettingsDialog({
  currentEmail,
  mode,
  onClose,
  open,
}: AccountSettingsDialogProps) {
  const [email, setEmail] = useState(currentEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setError("");
      setPassword("");
      setConfirmPassword("");
      return;
    }

    setEmail(currentEmail);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }, [currentEmail, open, mode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "email") {
        const nextEmail = email.trim();

        if (!nextEmail) {
          throw new Error("Enter an email address.");
        }

        const { error: updateError } = await supabase.auth.updateUser({
          email: nextEmail,
        });

        if (updateError) {
          throw updateError;
        }

        onClose();
        return;
      }

      if (password.length < 6) {
        throw new Error("Use at least 6 characters for the new password.");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      onClose();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copy = dialogCopy[mode];

  return (
    <Dialog fullWidth maxWidth="xs" onClose={onClose} open={open}>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent sx={{ pb: 2, pt: 2 }}>
        <Stack component="form" onSubmit={handleSubmit} spacing={2.5} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          {mode === "email" ? (
            <TextField
              autoFocus
              label="Email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          ) : (
            <>
              <TextField
                autoFocus
                inputProps={{ minLength: 6 }}
                label="New Password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
              <TextField
                inputProps={{ minLength: 6 }}
                label="Confirm New Password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </>
          )}

          <DialogActions sx={{ px: 0, pt: 0 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button disabled={isSubmitting} type="submit" variant="contained">
              {isSubmitting ? "Saving..." : copy.actionLabel}
            </Button>
          </DialogActions>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
