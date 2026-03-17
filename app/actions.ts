"use server";

import { openai } from "@ai-sdk/openai";
import { createStreamableValue } from "@ai-sdk/rsc";
import { streamText } from "ai";
import * as cheerio from "cheerio";

const MAX_WEBPAGE_CHARS = 12000;

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractReadableText(html: string) {
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
    title,
    description,
    text: trimmedText,
  };
}

function validateUrl(url: string) {
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

export async function summarizeWebsite(rawUrl: string) {
  const stream = createStreamableValue("");

  (async () => {
    try {
      const url = validateUrl(rawUrl.trim());

      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AIWebsiteSummarizer/1.0)",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch the webpage (${response.status} ${response.statusText}).`);
      }

      const html = await response.text();
      const page = extractReadableText(html);

      if (!page.text) {
        throw new Error("The webpage did not contain readable text to summarize.");
      }

      const result = streamText({
        model: openai("gpt-4o-mini"),
        prompt: `Summarize the following webpage clearly and concisely. Focus on the key ideas and structure the summary with bullet points.

URL: ${url}
Title: ${page.title || "Untitled"}
Description: ${page.description || "None"}

Webpage text:
${page.text}`,
      });

      for await (const delta of result.textStream) {
        stream.update(delta);
      }

      stream.done();
    } catch (error) {
      stream.error(error instanceof Error ? error : new Error("Failed to summarize the webpage."));
    }
  })();

  return stream.value;
}
