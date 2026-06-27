#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REVIEW_THREADS_QUERY = `
query PullRequestReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          isResolved
          isOutdated
          path
          line
          startLine
          comments(first: 100) {
            nodes {
              author {
                __typename
                login
              }
              body
              url
              createdAt
            }
          }
        }
      }
    }
  }
}
`;

export function isBotAuthor(author) {
  if (!author) {
    return false;
  }

  return author.__typename === "Bot" || /\[bot\]$/i.test(author.login ?? "");
}

export function collectUnresolvedBotThreads(threads) {
  return threads
    .map((thread) => {
      const botComments = (thread.comments?.nodes ?? []).filter((comment) => isBotAuthor(comment.author));
      return {
        ...thread,
        botComments
      };
    })
    .filter((thread) => !thread.isResolved && thread.botComments.length > 0);
}

export function formatThreadLocation(thread) {
  const line = thread.line ?? thread.startLine;
  return line ? `${thread.path}:${line}` : thread.path;
}

export function formatCommentPreview(body, limit = 160) {
  const normalized = (body ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
}

async function requestGraphql({ token, owner, name, number, after }) {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "greyfield-pr-bot-review-gate"
    },
    body: JSON.stringify({
      query: REVIEW_THREADS_QUERY,
      variables: { owner, name, number, after }
    })
  });

  const payload = await response.json();
  if (!response.ok || payload.errors) {
    const detail = payload.errors ? JSON.stringify(payload.errors) : response.statusText;
    throw new Error(`GitHub GraphQL request failed: ${detail}`);
  }

  return payload.data.repository.pullRequest.reviewThreads;
}

async function fetchReviewThreads({ token, repository, number }) {
  const [owner, name] = repository.split("/");
  if (!owner || !name) {
    throw new Error(`Invalid GITHUB_REPOSITORY value: ${repository}`);
  }

  const threads = [];
  let after = null;
  do {
    const page = await requestGraphql({ token, owner, name, number, after });
    threads.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return threads;
}

function readPullRequestNumber(eventPath) {
  if (!eventPath) {
    return null;
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  return event.pull_request?.number ?? null;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const number = readPullRequestNumber(process.env.GITHUB_EVENT_PATH);

  if (!number) {
    console.log("No pull_request payload found; skipping PR bot review gate.");
    return;
  }

  if (!token) {
    throw new Error("GITHUB_TOKEN is required for the PR bot review gate.");
  }

  if (!repository) {
    throw new Error("GITHUB_REPOSITORY is required for the PR bot review gate.");
  }

  const threads = await fetchReviewThreads({ token, repository, number });
  const blockingThreads = collectUnresolvedBotThreads(threads);

  if (blockingThreads.length === 0) {
    console.log("No unresolved bot-authored review threads found.");
    return;
  }

  console.error(`Found ${blockingThreads.length} unresolved bot-authored review thread(s).`);
  for (const thread of blockingThreads) {
    const firstBotComment = thread.botComments[0];
    const author = firstBotComment.author?.login ?? "unknown bot";
    const status = thread.isOutdated ? "outdated but unresolved" : "active";
    console.error(`- ${formatThreadLocation(thread)} (${status}) by ${author}`);
    console.error(`  ${firstBotComment.url}`);
    const preview = formatCommentPreview(firstBotComment.body);
    if (preview) {
      console.error(`  ${preview}`);
    }
  }
  console.error("Resolve the thread after fixing it, or explicitly resolve it as not applicable.");
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
