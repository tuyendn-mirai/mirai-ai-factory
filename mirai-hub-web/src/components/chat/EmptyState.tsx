import Image from "next/image";

export function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3.5 p-6">
      <Image src="/favicon.png" alt="" width={52} height={52} />
      <h1 className="text-center text-[19px] font-semibold text-foreground">
        Xin chào! Hỏi tôi bất cứ điều gì.
      </h1>
      <p className="max-w-[420px] text-center text-sm leading-[1.65] text-muted-foreground">
        Mở Settings ở sidebar để đổi model hoặc kết nối một MCP server (từ Langflow) nếu cần thêm công cụ cho cuộc trò chuyện này.
      </p>
    </div>
  );
}
