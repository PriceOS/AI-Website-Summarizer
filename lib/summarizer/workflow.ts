import { CREDITS_EXHAUSTED_MESSAGE } from "@/lib/credits/service";
import * as cheerio from "cheerio";

const MAX_WEBPAGE_CHARS = 12000;

export type ReadablePage = {
  description: string;
  text: string;
  title: string;
};

export type ConsumedCredit = {
  eventId: string;
  remainingCredits: number;
};

export type ExecuteSummarizeWebsiteDependencies = {
  authenticateUser: () => Promise<{ userId: string }>;
  consumeCredit: (input: { url: string; userId: string }) => Promise<ConsumedCredit>;
  fetchWebpage: (url: string) => Promise<string>;
  refundCredit: (input: {
    creditEventId: string;
    errorMessage: string;
    url: string;
    userId: string;
  }) => Promise<void>;
  streamSummary: (input: { page: ReadablePage; url: string }) => AsyncIterable<string>;
};

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractReadableText(html: string): ReadablePage {
  const $ = cheerio.load(html);

  $("script, style, noscript, iframe, svg, canvas, form, nav, footer, header").remove();

  const title = normalizeText($("title").first().text());
  const description = normalizeText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  );

  const textCandidates = ["main", "article", "body"]
    .map((selector) => normalizeText($(selector).first().text()))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  const text = textCandidates[0] ?? "";
  const trimmedText = text.slice(0, MAX_WEBPAGE_CHARS);

  return {
    description,
    text: trimmedText,
    title,
  };
}

export function validateUrl(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Enter a valid absolute URL, including http:// or https://.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http:// and https:// URLs are supported.");
  }

  return parsedUrl.toString();
}

export async function executeSummarizeWebsite(
  rawUrl: string,
  dependencies: ExecuteSummarizeWebsiteDependencies,
  onDelta: (delta: string) => void,
) {
  const { userId } = await dependencies.authenticateUser();
  const url = validateUrl(rawUrl.trim());
  const html = await dependencies.fetchWebpage(url);
  const page = extractReadableText(html);

  if (!page.text) {
    throw new Error("The webpage did not contain readable text to summarize.");
  }

  let consumedCredit: ConsumedCredit | null = null;

  try {
    consumedCredit = await dependencies.consumeCredit({
      url,
      userId,
    });

    for await (const delta of dependencies.streamSummary({
      page,
      url,
    })) {
      onDelta(delta);
    }

    return {
      remainingCredits: consumedCredit.remainingCredits,
    };
  } catch (error) {
    if (consumedCredit?.eventId) {
      await dependencies.refundCredit({
        creditEventId: consumedCredit.eventId,
        errorMessage: error instanceof Error ? error.message : "Unknown summarize failure.",
        url,
        userId,
      });
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error(CREDITS_EXHAUSTED_MESSAGE);
  }
}
