"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getPortalRedirectPath } from "@/lib/auth-redirect";
import type { RoleKey } from "@/lib/server/rbac";
import { PlatformName } from "@/components/branding/platform-name";
import { LoginPageProps } from "@/types/auth";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Building2, Loader2, ShieldCheck } from "lucide-react";

export default function LoginPage({
  heading,
  subHeading,
  submitButtonText,
  placeholderMail,
  portal,
  forgotPasswordUrl,
  RedirectUrl,
  SecondaryButtonText,
}: LoginPageProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(placeholderMail);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loginStep, setLoginStep] = useState<"credentials" | "otp">("credentials");
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (statusMessage) {
      toast.success(statusMessage);
    }
  }, [statusMessage]);

  useEffect(() => {
    let cancelled = false;

    async function redirectIfAuthenticated() {
      try {
        const response = await fetch("/api/v1/auth/me", { credentials: "include" });
        const payload = (await response.json()) as {
          data?: {
            user?: {
              roles?: RoleKey[];
            };
          };
          success: boolean;
        };

        if (!cancelled && response.ok && payload.success && payload.data?.user?.roles) {
          router.replace(getPortalRedirectPath(portal, payload.data.user.roles));
          router.refresh();
        }
      } catch {
        // Ignore and show the login form.
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    }

    void redirectIfAuthenticated();

    return () => {
      cancelled = true;
    };
  }, [portal, router]);

  async function handleCredentialsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          password,
          portal,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        success: boolean;
        data?: {
          requiresOtp?: boolean;
          challengeId?: string;
          maskedEmail?: string;
          redirectPath?: string;
        };
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message ?? "Unable to sign in");
        return;
      }

      if (payload.data?.requiresOtp && payload.data.challengeId) {
        setChallengeId(payload.data.challengeId);
        setMaskedEmail(payload.data.maskedEmail ?? null);
        setOtp("");
        setLoginStep("otp");
        setStatusMessage(payload.message ?? "Verification code sent to your email");
        return;
      }

      router.replace(payload.data?.redirectPath ?? "/admin/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign in. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleOtpSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!challengeId) {
      setErrorMessage("Your verification session expired. Please sign in again.");
      setLoginStep("credentials");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/auth/login/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          challengeId: challengeId.trim(),
          otp: otp.trim(),
          portal,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        success: boolean;
        errorCode?: string;
        data?: {
          redirectPath?: string;
        };
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message ?? "Invalid verification code");

        if (
          payload.errorCode === "OTP_CHALLENGE_INVALID" ||
          payload.errorCode === "OTP_REPLACED" ||
          payload.errorCode === "OTP_EXPIRED"
        ) {
          setLoginStep("credentials");
          setChallengeId(null);
          setMaskedEmail(null);
          setOtp("");
        }

        return;
      }

      router.replace(payload.data?.redirectPath ?? "/admin/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Unable to verify the code. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleResendOtp() {
    if (!challengeId) {
      setErrorMessage("Your verification session expired. Please sign in again.");
      setLoginStep("credentials");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/auth/login/resend-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          challengeId: challengeId.trim(),
          portal,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        success: boolean;
        errorCode?: string;
        data?: {
          challengeId?: string;
          maskedEmail?: string;
        };
      };

      if (!response.ok || !payload.success || !payload.data?.challengeId) {
        setErrorMessage(payload.message ?? "Unable to resend verification code");

        if (payload.errorCode === "OTP_CHALLENGE_INVALID") {
          setLoginStep("credentials");
          setChallengeId(null);
          setMaskedEmail(null);
          setOtp("");
        }

        return;
      }

      setChallengeId(payload.data.challengeId);
      setMaskedEmail(payload.data.maskedEmail ?? null);
      setOtp("");
      setStatusMessage(payload.message ?? "A new verification code has been sent");
    } catch {
      setErrorMessage("Unable to resend verification code. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  if (isCheckingSession) {
    return (
      <div className="px-8 md:px-10 py-12 w-full flex flex-col items-center justify-center gap-3">
        <Loader2 size={20} className="text-[#3b82f6] animate-spin" />
        <p className="text-[12px] text-[#94a3b8] tracking-wide">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="px-8 md:px-10 pt-9 pb-8 w-full">

      {/* Heading block */}
      <div className="mb-7">
        <p className="text-[10px] font-bold text-[#3b82f6] tracking-[0.2em] uppercase mb-2.5 leading-snug">
          <PlatformName />
        </p>
        <h2 className="text-[#0a1628] text-[22px] md:text-[24px] font-bold tracking-tight leading-tight mb-2">
          {heading}
        </h2>
        <p className="text-[#64748b] text-[13px] leading-relaxed">
          {subHeading}
        </p>
      </div>

      {loginStep === "otp" ? (
        <form className="space-y-4" onSubmit={handleOtpSubmit}>
          <div className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3">
            <div className="flex items-start gap-3">
              <ShieldCheck size={16} className="text-[#2563eb] mt-0.5 shrink-0" />
              <div>
                <p className="text-[12.5px] font-semibold text-[#0a1628]">Two-step verification</p>
                <p className="text-[12px] text-[#64748b] mt-1 leading-relaxed">
                  Enter the 6 digit code sent to {maskedEmail ?? "your registered email"}.
                </p>
              </div>
            </div>
          </div>

          <LabelInputContainer>
            <Label
              htmlFor="otp"
              className="text-[10.5px] font-semibold text-[#64748b] tracking-[0.18em] uppercase"
            >
              Verification Code
            </Label>
            <Input
              id="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6 digit code"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-11 bg-[#f8faff] border-[#dde6f7] rounded-xl text-[13.5px] text-[#0a1628] placeholder:text-[#c5cfe8] focus-visible:ring-[#3b82f6]/20 focus-visible:border-[#3b82f6] focus-visible:bg-white transition-all duration-200 shadow-none tracking-[0.35em] text-center font-semibold"
              required
            />
          </LabelInputContainer>

          <button
            type="submit"
            disabled={isPending || otp.length !== 6}
            className="group relative w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.985] overflow-hidden bg-[#0a1628] hover:bg-[#0f2040] shadow-[0_2px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  Verify and continue
                  <ArrowRight size={14} />
                </>
              )}
            </span>
          </button>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setLoginStep("credentials");
                setOtp("");
                setChallengeId(null);
                setMaskedEmail(null);
                setErrorMessage(null);
                setStatusMessage(null);
              }}
              className="text-[11.5px] text-[#64748b] hover:text-[#0a1628] transition-colors"
            >
              Back to sign in
            </button>
            <button
              type="button"
              onClick={() => void handleResendOtp()}
              disabled={isPending}
              className="text-[11.5px] text-[#3b82f6] font-medium hover:text-[#2563eb] hover:underline underline-offset-2 transition-colors disabled:opacity-60"
            >
              Resend code
            </button>
          </div>
        </form>
      ) : (
      <form className="space-y-4" onSubmit={handleCredentialsSubmit}>

        <LabelInputContainer>
          <Label
            htmlFor="email"
            className="text-[10.5px] font-semibold text-[#64748b] tracking-[0.18em] uppercase"
          >
            Email Address
          </Label>
          <div className="relative group">
            <Mail
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] group-focus-within:text-[#3b82f6] pointer-events-none transition-colors duration-200"
            />
            <Input
              id="email"
              type="email"
              placeholder={placeholderMail}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 pl-10 pr-4 bg-[#f8faff] border-[#dde6f7] rounded-xl text-[13.5px] text-[#0a1628] placeholder:text-[#c5cfe8] focus-visible:ring-[#3b82f6]/20 focus-visible:border-[#3b82f6] focus-visible:bg-white transition-all duration-200 shadow-none"
              autoComplete="email"
              required
            />
          </div>
        </LabelInputContainer>

        <LabelInputContainer>
          <Label
            htmlFor="password"
            className="text-[10.5px] font-semibold text-[#64748b] tracking-[0.18em] uppercase"
          >
            Password
          </Label>
          <div className="relative group">
            <Lock
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] group-focus-within:text-[#3b82f6] pointer-events-none transition-colors duration-200"
            />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 pl-10 pr-11 bg-[#f8faff] border-[#dde6f7] rounded-xl text-[13.5px] text-[#0a1628] placeholder:text-[#c5cfe8] focus-visible:ring-[#3b82f6]/20 focus-visible:border-[#3b82f6] focus-visible:bg-white transition-all duration-200 shadow-none"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#3b82f6] transition-colors duration-200 p-0.5"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </LabelInputContainer>

        <div className="flex justify-end pt-0.5">
          <a
            href={forgotPasswordUrl}
            className="text-[11.5px] text-[#3b82f6] font-medium hover:text-[#2563eb] hover:underline underline-offset-2 transition-colors"
          >
            Forgot password?
          </a>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isPending}
          className="group relative w-full h-11 rounded-xl text-[13px] font-semibold tracking-wide text-white flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.985] overflow-hidden bg-[#0a1628] hover:bg-[#0f2040] shadow-[0_2px_12px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.35)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {/* Gradient shimmer on hover */}
          <span className="absolute inset-0 bg-linear-to-r from-[#1d4ed8]/0 via-[#3b82f6]/15 to-[#1d4ed8]/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="relative z-10 flex items-center gap-2">
            {isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                {submitButtonText}
                <ArrowRight
                  size={14}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </>
            )}
          </span>
        </button>

      </form>
      )}

      {loginStep === "credentials" && (
      <>
      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[#edf0f7]" />
        <span className="text-[9.5px] text-[#94a3b8] font-semibold tracking-[0.2em] uppercase">
          or continue as
        </span>
        <div className="flex-1 h-px bg-[#edf0f7]" />
      </div>

      {/* Secondary portal button */}
      <a href={RedirectUrl}>
        <button
          type="button"
          className="group w-full h-11 bg-[#f8faff] border border-[#dde6f7] hover:border-[#3b82f6]/50 hover:bg-[#eff6ff] rounded-xl text-[13px] text-[#475569] hover:text-[#0a1628] flex items-center px-4 gap-3 transition-all duration-200"
        >
          <div className="w-6 h-6 rounded-lg bg-[#0a1628] flex items-center justify-center shrink-0">
            <Building2 size={11} className="text-[#60a5fa]" />
          </div>
          <span className="font-medium">{SecondaryButtonText}</span>
          <ArrowRight
            size={12}
            className="ml-auto text-[#c5cfe8] group-hover:text-[#3b82f6] group-hover:translate-x-0.5 transition-all duration-200"
          />
        </button>
      </a>
      </>
      )}

      {/* Footer */}
      <p className="mt-6 text-center text-[10.5px] text-[#94a3b8] leading-relaxed">
        By signing in you agree to our{" "}
        <a href="/terms" className="text-[#3b82f6] hover:underline underline-offset-2 font-medium">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-[#3b82f6] hover:underline underline-offset-2 font-medium">
          Privacy Policy
        </a>
      </p>

    </div>
  );
}

const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    {children}
  </div>
);
