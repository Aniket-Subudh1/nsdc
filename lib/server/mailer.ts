import nodemailer from "nodemailer";

import { PLATFORM_NAME } from "@/constants/branding";
import { getEnv } from "@/lib/server/env";

const globalMailer = globalThis as typeof globalThis & {
  nodemailerTransport?: nodemailer.Transporter;
};

export function isMailerConfigured() {
  const env = getEnv();

  return Boolean(env.SMTP_HOST && env.SMTP_FROM && env.SMTP_USER && env.SMTP_PASS);
}

function getTransport() {
  if (!globalMailer.nodemailerTransport) {
    const env = getEnv();

    globalMailer.nodemailerTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE && env.SMTP_PORT === 587,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return globalMailer.nodemailerTransport;
}

export async function sendLoginOtpEmail(input: {
  email: string;
  name: string;
  otp: string;
}) {
  const env = getEnv();
  const ttlMinutes = env.LOGIN_OTP_TTL_MINUTES;
  await getTransport().sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: `${PLATFORM_NAME} Admin login verification code`,
    text: `Hello ${input.name},\n\nYour ${PLATFORM_NAME} admin login verification code is ${input.otp}. It is valid for ${ttlMinutes} minutes. If you did not attempt to sign in, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:24px;">Verify your admin sign-in</h2>
        <p style="margin:0 0 16px;">Hello ${input.name},</p>
        <p style="margin:0 0 16px;">Use the verification code below to complete your admin portal sign-in.</p>
        <div style="margin:20px 0;padding:16px 20px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;font-size:28px;font-weight:700;letter-spacing:8px;text-align:center;">${input.otp}</div>
        <p style="margin:0 0 16px;">This code will expire in ${ttlMinutes} minutes.</p>
        <p style="margin:0;color:#64748b;">If you did not attempt to sign in, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetOtpEmail(input: {
  email: string;
  name: string;
  otp: string;
  portal: "admin" | "training_partner";
}) {
  const env = getEnv();
  const portalLabel = input.portal === "admin" ? "Admin" : "Training Partner";
  const ttlMinutes = env.PASSWORD_RESET_OTP_TTL_MINUTES;
  await getTransport().sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: `${PLATFORM_NAME} ${portalLabel} password reset OTP`,
    text: `Hello ${input.name},\n\nYour ${PLATFORM_NAME} ${portalLabel} password reset OTP is ${input.otp}. It is valid for ${ttlMinutes} minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:24px;">Reset your ${PLATFORM_NAME} password</h2>
        <p style="margin:0 0 16px;">Hello ${input.name},</p>
        <p style="margin:0 0 16px;">Use the OTP below to reset your ${portalLabel} portal password.</p>
        <div style="margin:20px 0;padding:16px 20px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;font-size:28px;font-weight:700;letter-spacing:8px;text-align:center;">${input.otp}</div>
        <p style="margin:0 0 16px;">This OTP will expire in ${ttlMinutes} minutes.</p>
        <p style="margin:0;color:#64748b;">If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  });
}