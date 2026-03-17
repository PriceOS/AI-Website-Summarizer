"use client";

import { summarizeWebsite } from "../app/actions";
import { readStreamableValue } from "@ai-sdk/rsc";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, type FormEvent } from "react";

export function SummarizerApp() {
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
    <Container maxWidth="md">
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          minHeight: "100vh",
          py: { xs: 6, md: 10 },
        }}
      >
        <Stack spacing={3} sx={{ width: "100%" }}>
          <Paper
            elevation={0}
            sx={{
              border: "1px solid rgba(21, 101, 192, 0.12)",
              p: { xs: 3, md: 4 },
            }}
          >
            <Stack component="form" onSubmit={handleSubmit} spacing={3}>
              <Box>
                <Typography component="h1" variant="h4" fontWeight={700} gutterBottom>
                  AI Website Summarizer
                </Typography>
                <Typography color="text.secondary">
                  Paste a webpage URL and get a concise streamed summary.
                </Typography>
              </Box>

              <TextField
                fullWidth
                disabled={isLoading}
                label="Website URL"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                required
                type="url"
                value={url}
              />

              <Box sx={{ display: "flex", justifyContent: "flex-start" }}>
                <Button
                  disabled={isLoading}
                  size="large"
                  type="submit"
                  variant="contained"
                >
                  {isLoading ? "Summarizing..." : "Summarize"}
                </Button>
              </Box>
            </Stack>
          </Paper>

          <Card
            sx={{
              minHeight: 240,
            }}
          >
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h6" fontWeight={600}>
                  Summary
                </Typography>

                {error ? <Alert severity="error">{error}</Alert> : null}

                {!error && !summary && !isLoading ? (
                  <Typography color="text.secondary">
                    The streamed summary will appear here after you submit a URL.
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
      </Box>
    </Container>
  );
}
