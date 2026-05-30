"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, KeyRound, Lock, Mail } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type ForgotPasswordPageProps } from "@/types/auth";

export default function ForgotPasswordForm({
  heading,
  subHeading,
  placeholderMail,
  portal,
  loginUrl,
  redirectUrl,
  secondaryButtonText,
}: ForgotPasswordPageProps) {
  const router = useRouter();
  const [email, setEmail] = useState(placeholderMail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<"request" | "reset" | "success">("request");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleRequestOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/auth/forgot-password/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          portal,
        }),
      });
      const payload = (await response.json()) as { message?: string; success: boolean };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message ?? "Unable to send OTP");
        return;
      }

      setStep("reset");
      setStatusMessage(payload.message ?? "OTP sent to your email");
    } catch {
      setErrorMessage("Unable to send OTP. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/v1/auth/forgot-password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          otp,
          newPassword,
          portal,
        }),
      });
      const payload = (await response.json()) as {
        message?: string;
        success: boolean;
        data?: { redirectPath?: string };
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message ?? "Unable to reset password");
        return;
      }

      setStep("success");
      setStatusMessage(payload.data?.redirectPath ? payload.message ?? "Password reset successful" : payload.message ?? "Password reset successful");

      setTimeout(() => {
        router.replace(payload.data?.redirectPath ?? loginUrl);
      }, 1500);
    } catch {
      setErrorMessage("Unable to reset password. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-3xl p-8 md:p-10 w-full">
      <div className="mb-8">
        <h2 className="text-[#010d1f] text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-2">
          {heading}
        </h2>
        <p className="text-gray-800 text-sm leading-relaxed">{subHeading}</p>
      </div>

      {step === "request" ? (
        <form className="space-y-5" onSubmit={handleRequestOtp}>
          <LabelInputContainer>
            <Label htmlFor="email" className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">
              Email Address
            </Label>
            <div className="relative">
              <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <Input
                id="email"
                type="email"
                placeholder={placeholderMail}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 pl-10 pr-4 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300"
                autoComplete="email"
                required
              />
            </div>
          </LabelInputContainer>

          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          {statusMessage ? <StatusBanner message={statusMessage} /> : null}

          <button
            type="submit"
            disabled={isPending}
            className="group relative w-full h-11 bg-[#010d1f] hover:bg-[#0a1f3d] text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isPending ? "Sending OTP..." : "Send OTP"}
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </button>
        </form>
      ) : null}

      {step === "reset" ? (
        <form className="space-y-5" onSubmit={handleResetPassword}>
          <LabelInputContainer>
            <Label htmlFor="otp" className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">
              OTP
            </Label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                placeholder="6 digit OTP"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-11 pl-10 pr-4 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 tracking-[0.4em]"
                required
              />
            </div>
          </LabelInputContainer>

          <LabelInputContainer>
            <Label htmlFor="new-password" className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">
              New Password
            </Label>
            <div className="relative">
              <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <Input
                id="new-password"
                type="password"
                placeholder="Enter a new password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-11 pl-10 pr-4 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300"
                autoComplete="new-password"
                required
              />
            </div>
          </LabelInputContainer>

          <LabelInputContainer>
            <Label htmlFor="confirm-password" className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter the new password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-11 pl-10 pr-4 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300"
                autoComplete="new-password"
                required
              />
            </div>
          </LabelInputContainer>

          {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
          {statusMessage ? <StatusBanner message={statusMessage} /> : null}

          <button
            type="submit"
            disabled={isPending}
            className="group relative w-full h-11 bg-[#010d1f] hover:bg-[#0a1f3d] text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isPending ? "Resetting password..." : "Reset Password"}
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStep("request");
              setOtp("");
              setNewPassword("");
              setConfirmPassword("");
              setErrorMessage(null);
            }}
            className="w-full h-11 rounded-xl border border-gray-200 bg-white text-sm font-medium text-slate-600 hover:border-[#1a56db] hover:text-[#1a56db] transition-colors"
          >
            Resend OTP
          </button>
        </form>
      ) : null}

      {step === "success" ? (
        <div className="space-y-5">
          {statusMessage ? <StatusBanner message={statusMessage} /> : null}
          <button
            type="button"
            onClick={() => router.replace(loginUrl)}
            className="group relative w-full h-11 bg-[#010d1f] hover:bg-[#0a1f3d] text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              Back to login
              <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-400" />
        <span className="text-[10px] text-gray-800 font-medium tracking-[0.16em] uppercase">or continue as</span>
        <div className="flex-1 h-px bg-gray-400" />
      </div>

      {redirectUrl && secondaryButtonText ? (
        <a href={redirectUrl}>
          <button
            type="button"
            className="group w-full h-11 bg-transparent border border-gray-200 hover:border-[#1a56db] hover:bg-[#1a56db]/3 rounded-xl text-sm text-gray-500 hover:text-[#010d1f] flex items-center px-4 gap-3 transition-all duration-200"
          >
            <div className="w-6 h-6 rounded-lg bg-[#010d1f] flex items-center justify-center shrink-0">
              <Building2 size={12} className="text-[#3b82f6]" />
            </div>
            <span className="font-medium">{secondaryButtonText}</span>
            <ArrowRight size={13} className="ml-auto text-gray-300 group-hover:text-[#1a56db] group-hover:translate-x-0.5 transition-all duration-200" />
          </button>
        </a>
      ) : null}

      <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
        Remembered your password?{" "}
        <a href={loginUrl} className="text-[#1a56db] hover:underline underline-offset-2">
          Back to login
        </a>
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

function StatusBanner({ message }: { message: string }) {
  return <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>;
}

const LabelInputContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => <div className={cn("flex flex-col gap-1.5", className)}>{children}</div>;