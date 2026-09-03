import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar">
      <div className="flex flex-col items-center gap-[18px]">
        <div className="w-[380px] rounded-xl border border-border bg-background p-10 px-9 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
          <div className="mb-[22px] flex justify-center">
            <Image src="/logo_light.png" alt="Mirai Hub" width={168} height={40} priority className="h-auto w-[168px]" />
          </div>
          <p className="mb-[30px] text-center text-[13.5px] leading-[1.5] text-muted-foreground">
            Trợ lý chat của nền tảng Mirai AI Factory
          </p>
          <LoginForm />
        </div>
        <span className="text-xs text-muted-foreground">Mirai AI Factory · Internal</span>
      </div>
    </div>
  );
}
