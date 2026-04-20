"use server";

import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "@ai-sdk/rsc";
import { streamText } from "ai";
import { consumeSummaryCredit, refundSummaryCredit } from "@/lib/credits/service";
import { executeSummarizeWebsite } from "@/lib/summarizer/workflow";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function summarizeWebsite(rawUrl: string) {
  const stream = createStreamableValue("");

  (async () => {
    try {
      await executeSummarizeWebsite(
        rawUrl,
        {
          authenticateUser: async () => {
            const supabase = await getSupabaseServerClient();
            const {
              data: { user },
              error: authError,
            } = await supabase.auth.getUser();

            if (authError || !user) {
              throw new Error("Log in to summarize websites.");
            }

            return {
              userId: user.id,
            };
          },
          consumeCredit: async ({ url, userId }) => {
            const consumption = await consumeSummaryCredit(userId, {
              url,
            });

            return {
              eventId: consumption.eventId,
              remainingCredits: consumption.balance,
            };
          },
          fetchWebpage: async (url) => {
            const response = await fetch(url, {
              cache: "no-store",
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; AIWebsiteSummarizer/1.0)",
              },
            });

            if (!response.ok) {
              throw new Error(
                `Failed to fetch the webpage (${response.status} ${response.statusText}).`,
              );
            }

            return response.text();
          },
          refundCredit: async ({ creditEventId, errorMessage, url, userId }) => {
            await refundSummaryCredit(creditEventId, {
              errorMessage,
              url,
              userId,
            });
          },
          streamSummary: ({ page, url }) => {
            const result = streamText({
              model: openai("gpt-4o-mini"),
              prompt: `Summarize the following webpage clearly and concisely. Focus on the key ideas and structure the summary with bullet points.

URL: ${url}
Title: ${page.title || "Untitled"}
Description: ${page.description || "None"}

Webpage text:
${page.text}`,
            });

            return result.textStream;
          },
        },
        (delta) => {
          stream.update(delta);
        },
      );

      stream.done();
    } catch (error) {
      stream.error(error instanceof Error ? error : new Error("Failed to summarize the webpage."));
    }
  })();

  return {
    stream: stream.value,
  };
}
