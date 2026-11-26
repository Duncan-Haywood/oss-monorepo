// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signUpEmail = vi.fn();
const sendVerificationEmail = vi.fn();
const navigate = vi.fn();

vi.mock("@client/lib/auth-client", () => ({
  authClient: {
    signUp: { email: signUpEmail },
    signIn: { social: vi.fn() },
    sendVerificationEmail,
  },
  readNextParam: () => null,
  safeNext: (n: string) => n,
}));
vi.mock("@client/lib/session", () => ({ refreshMe: vi.fn(async () => null) }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, params, ...rest }: Record<string, unknown>) => (
    <a
      href={String(to).replace("$doc", String((params as { doc?: string } | undefined)?.doc))}
      {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
    >
      {children as React.ReactNode}
    </a>
  ),
}));

const { SignupPage } = await import("./signup");

beforeEach(() => {
  signUpEmail.mockReset();
  // A session token = signed in straight away (email verification off).
  signUpEmail.mockResolvedValue({ data: { token: "tok_1", user: { id: "u1" } }, error: null });
  sendVerificationEmail.mockReset();
  sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
  navigate.mockReset();
});
afterEach(cleanup);

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Your name"), "Ada Tsosie");
  await user.type(screen.getByLabelText("Work email"), "ada@swif.example");
  await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
}

describe("<SignupPage>", () => {
  it("links to the Terms, Privacy Policy and Data Use Policy", () => {
    render(<SignupPage />);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
    expect(screen.getByRole("link", { name: "Data Use Policy" })).toHaveAttribute(
      "href",
      "/legal/data-use",
    );
  });

  it("blocks sign-up until the policies checkbox is ticked", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);
    await fillValid(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUpEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/agree to the Terms/);
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects passwords shorter than 10 characters", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);
    await user.type(screen.getByLabelText("Your name"), "Ada");
    await user.type(screen.getByLabelText("Work email"), "ada@swif.example");
    await user.type(screen.getByLabelText("Password"), "short123");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();
  });

  it("signs up and goes to onboarding once terms are accepted", async () => {
    const user = userEvent.setup();
    render(<SignupPage />);
    await fillValid(user);
    await user.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(signUpEmail).toHaveBeenCalledWith({
      name: "Ada Tsosie",
      email: "ada@swif.example",
      password: "correct-horse-battery",
    });
    expect(navigate).toHaveBeenCalledWith({ href: "/onboarding" });
  });

  it("asks the user to check their inbox when sign-up returns no session", async () => {
    signUpEmail.mockResolvedValue({ data: { token: null, user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<SignupPage />);
    await fillValid(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(screen.getByText("ada@swif.example")).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Resend email" }));
    expect(sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@swif.example" });
    expect(await screen.findByText("Sent — check your inbox.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("shows a friendly error when the email is taken", async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { status: 422, code: "USER_ALREADY_EXISTS", message: "User already exists" },
    });
    const user = userEvent.setup();
    render(<SignupPage />);
    await fillValid(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText(/already exists. Try signing in/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
