"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LoginPageProps } from "@/types/auth";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Building2 } from "lucide-react";

export default function LoginPage({
  heading,
  subHeading,
  submitButtonText,
  placeholderMail,
  portal,
  RedirectUrl,
  SecondaryButtonText,
}: LoginPageProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(placeholderMail);
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setErrorMessage(null);

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
          redirectPath?: string;
        };
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.message ?? "Unable to sign in");
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

  return (
    <div className=" rounded-3xl p-8 md:p-10 w-full">

      <div className="mb-8">
        <h2 className="text-[#010d1f] text-2xl md:text-[28px] font-bold tracking-tight leading-tight mb-2">
          {heading}
        </h2>
        <p className="text-gray-800 text-sm leading-relaxed">
          {subHeading}
        </p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <LabelInputContainer>
          <Label
            htmlFor="email"
            className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase"
          >
            Email Address
          </Label>
          <div className="relative">
            <Mail
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"
            />
            <Input
              id="email"
              type="email"
              placeholder={placeholderMail}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 pl-10 pr-4 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus-visible:ring-[#1a56db]/20 focus-visible:border-[#1a56db] transition-all"
              autoComplete="email"
              required
            />
          </div>
        </LabelInputContainer>
        <LabelInputContainer>
          <Label
            htmlFor="password"
            className="text-[11px] font-semibold text-gray-400 tracking-widest uppercase"
          >
            Password
          </Label>
          <div className="relative">
            <Lock
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none"
            />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 pl-10 pr-11 bg-gray-50 border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-300 focus-visible:ring-[#1a56db]/20 focus-visible:border-[#1a56db] transition-all"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </LabelInputContainer>

        <div className="flex justify-end mt-1!">
          <a
            href="/forgot-password"
            className="text-[12px] text-[#1a56db] font-medium hover:underline underline-offset-2 transition-colors"
          >
            Forgot password?
          </a>
        </div>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="group relative w-full h-11 bg-[#010d1f] hover:bg-[#0a1f3d] text-white rounded-xl text-sm font-semibold tracking-wide flex items-center justify-center gap-2.5 transition-all duration-200 active:scale-[0.98] overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            {isPending ? "Signing in..." : submitButtonText}
            <ArrowRight
              size={15}
              className="transition-transform duration-200 group-hover:translate-x-1"
            />
          </span>
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-[#1a56db]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </button>

      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-400" />
        <span className="text-[10px] text-gray-800 font-medium tracking-[0.16em] uppercase">
          or continue as
        </span>
        <div className="flex-1 h-px bg-gray-400" />
      </div>
     <a href={RedirectUrl}>
      <button
        type="button"
        className="group w-full h-11 bg-transparent border border-gray-200 hover:border-[#1a56db] hover:bg-[#1a56db]/3 rounded-xl text-sm text-gray-500 hover:text-[#010d1f] flex items-center px-4 gap-3 transition-all duration-200"
      >
        <div className="w-6 h-6 rounded-lg bg-[#010d1f] flex items-center justify-center shrink-0">
          <Building2 size={12} className="text-[#3b82f6]" />
        </div>
        <span className="font-medium">{SecondaryButtonText}</span>
        <ArrowRight
          size={13}
          className="ml-auto text-gray-300 group-hover:text-[#1a56db] group-hover:translate-x-0.5 transition-all duration-200"
        />
      </button>
    </a>
      <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
        By signing in you agree to our{" "}
        <a href="/terms" className="text-[#1a56db] hover:underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-[#1a56db] hover:underline underline-offset-2">
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