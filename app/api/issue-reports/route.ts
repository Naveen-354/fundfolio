import { createIssueReport } from "@/lib/issues/repository";
import { isDatabaseConfigured } from "@/lib/funds/postgres-repository";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if ((origin && origin !== new URL(request.url).origin) || (!origin && fetchSite !== "same-origin")) {
    return reply({ error: "This request is not allowed." }, 403);
  }
  if (!isDatabaseConfigured()) return reply({ error: "Problem reports are temporarily unavailable." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Enter the details of the problem and try again." }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return reply({ error: "Enter the details of the problem and try again." }, 400);
  }

  const fields = body as { name?: unknown; email?: unknown; message?: unknown; pagePath?: unknown; company?: unknown };
  if (typeof fields.company === "string" && fields.company.trim()) return reply({ submitted: true }, 201);

  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  const email = typeof fields.email === "string" ? fields.email.trim().toLowerCase() : "";
  const message = typeof fields.message === "string" ? fields.message.trim() : "";
  const pagePath = typeof fields.pagePath === "string" ? fields.pagePath.trim() : "";
  if (name.length > 120 || email.length > 320 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return reply({ error: "Enter a valid email address and keep your name under 120 characters." }, 400);
  }
  if (message.length < 10 || message.length > 5000) {
    return reply({ error: "Describe the problem in 10 to 5,000 characters." }, 400);
  }
  if (pagePath && (!pagePath.startsWith("/") || pagePath.startsWith("//") || pagePath.length > 2048 || /[\r\n]/.test(pagePath))) {
    return reply({ error: "The page reference is invalid." }, 400);
  }

  try {
    await createIssueReport({
      reporterName: name || null,
      reporterEmail: email || null,
      message,
      pagePath: pagePath || null,
    });
    return reply({ submitted: true }, 201);
  } catch {
    return reply({ error: "We couldn’t send your report just now. Please try again." }, 502);
  }
}
