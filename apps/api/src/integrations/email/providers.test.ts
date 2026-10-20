import { describe, expect, it, vi } from "vitest";
import { ResendEmailProvider } from "./providers";
import { accountExistsMessage, resetPasswordMessage, verifyEmailMessage } from "./templates";

describe("ResendEmailProvider", () => {
  it("posts the message with the API key and returns the provider id", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }),
    );
    const provider = new ResendEmailProvider("re_test_key", fetchMock);

    const result = await provider.send(
      { to: "asha@example.com", subject: "Hi", text: "Hello", html: "<p>Hello</p>" },
      "FitCoach <noreply@example.com>",
    );

    expect(result.providerMessageId).toBe("re_123");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer re_test_key");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      to: ["asha@example.com"],
      subject: "Hi",
    });
  });

  it("fails with the status only, never the response body", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("invalid recipient asha@example.com", { status: 422 }),
    );
    const provider = new ResendEmailProvider("re_test_key", fetchMock);

    await expect(
      provider.send({ to: "asha@example.com", subject: "s", text: "t", html: "h" }, "from"),
    ).rejects.toThrow(/^Resend responded 422$/);
  });
});

describe("auth email templates", () => {
  it("puts the link in both text and HTML and escapes user input", () => {
    const message = verifyEmailMessage(
      "a@b.co",
      "<script>Asha</script>",
      "http://localhost:3000/verify-email?token=abc",
    );

    expect(message.text).toContain("http://localhost:3000/verify-email?token=abc");
    expect(message.html).toContain("verify-email?token=abc");
    expect(message.html).not.toContain("<script>");
  });

  it("has distinct subjects for each auth email", () => {
    const subjects = new Set([
      verifyEmailMessage("a@b.co", "A", "u").subject,
      resetPasswordMessage("a@b.co", "u").subject,
      accountExistsMessage("a@b.co", "l", "r").subject,
    ]);

    expect(subjects.size).toBe(3);
  });
});
