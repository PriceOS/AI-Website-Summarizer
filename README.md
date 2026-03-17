# AI Website Summarizer

Minimal AI-powered Next.js app that fetches a webpage, extracts readable text,
and streams back a concise summary using OpenAI.

## Stack

- Next.js App Router
- TypeScript
- Material UI
- Vercel AI SDK
- OpenAI
- Server Actions

## Local Development

Create a local environment file with your OpenAI key:

```bash
OPENAI_API_KEY=your_key_here
```

Then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

1. Enter a webpage URL in the app.
2. A Server Action fetches the page HTML.
3. The server extracts readable text with `cheerio`.
4. The extracted text is summarized with OpenAI.
5. The summary streams back to the UI in real time.

## Deploy

This app is a good fit for Vercel. Add `OPENAI_API_KEY` as an environment
variable in your deployment target before publishing.
