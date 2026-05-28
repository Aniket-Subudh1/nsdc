import Login from "@/components/auth/login";
import { AUTH_CONTENT } from "@/constants/auth";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

const Page = () => {
  return (
    <main className="min-h-screen flex bg-[#f8fbff] overflow-hidden">

      <section className="hidden lg:flex relative w-[25%] xl:w-[25%] bg-white border-r border-[#051f42] overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-[size:64px_64px]" />
        <div className="absolute top-0 right-0 w-[420px] h-[420px] rounded-full bg-[#60a5fa] opacity-20 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-[#3b82f6] opacity-10 blur-[100px]" />
        <div className="absolute right-[-80px] top-[28%] w-[320px] h-[320px] rounded-full border border-[#93c5fd]" />
        <div className="absolute right-[-60px] top-[30%] w-[240px] h-[240px] rounded-full border border-[#bfdbfe]" />
        <div className="absolute left-[-50px] bottom-[15%] w-[200px] h-[200px] rounded-full border border-[#dbeafe]" />
        <div className="relative z-10 flex items-center flex-col h-full w-full px-10 xl:px-12 py-10 justify-between">

          <div className="flex items-center">
            <div className="px-6 py-3 ">
              <Image
                src="/logo.png"
                alt="Logo"
                height={38}
                width={120}
                className="object-contain h-auto w-auto shrink-0"
              />
            </div>
          </div>

          <div className="max-w-[340px]">
            <h1 className="text-[#0f172a] text-[38px] xl:text-[40px] font-black leading-[1.1] tracking-tight mb-6">
              Gram Tarang{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2563eb] to-[#60a5fa]">
                Training
              </span>{" "}
              Center
            </h1>

            <p className="text-[#64748b] text-[14px] leading-[1.85] font-normal">
              Empowering India through skill development and training,
              fostering growth and opportunity for all.
            </p>
          </div>

          <div className="bg-[#eff6ff] border border-[#dbeafe] -mb-10 rounded-xl px-5 py-2 shadow-sm">
            <Image
              src="/skill.png"
              alt="Skill India"
              width={80}
              height={40}
              className="object-contain shrink-0"
            />
          </div>

          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">

              <div className="w-9 h-9 rounded-full border border-[#bfdbfe] bg-[#eff6ff] flex items-center justify-center">
                <ShieldCheck
                  size={16}
                  className="text-[#2563eb]"
                />
              </div>

              <span className="text-[#64748b] text-xs tracking-wide">
                Powered By Skill India
              </span>

            </div>
          </div>

        </div>
      </section>

      <section className="flex-1 flex items-center justify-center px-5 sm:px-8 md:px-12 py-10 min-h-screen relative">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-[-100px] right-[-100px] w-[300px] h-[300px] rounded-full bg-[#dbeafe] blur-[100px] opacity-50" />
          <div className="absolute bottom-[-120px] left-[-120px] w-[260px] h-[260px] rounded-full bg-[#bfdbfe] blur-[100px] opacity-40" />
        </div>

        <div className="relative z-10 w-full max-w-[440px]">

          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-2xl px-6 py-3 shadow-sm">
              <Image
                src="/logo.png"
                alt="Logo"
                height={36}
                width={110}
                className="object-contain h-auto w-auto shrink-0"
              />
            </div>
          </div>
            <Login
              heading={AUTH_CONTENT.admin.heading}
              subHeading={AUTH_CONTENT.admin.subHeading}
              submitButtonText={
                AUTH_CONTENT.admin.SubmitButtonText
              }
              placeholderMail={AUTH_CONTENT.admin.PlaceholderMail}
              RedirectUrl={AUTH_CONTENT.admin.RedirectUrl}
              SecondaryButtonText={AUTH_CONTENT.admin.SecondaryButtonText}
            />
        </div>
      </section>
    </main>
  );
};

export default Page;