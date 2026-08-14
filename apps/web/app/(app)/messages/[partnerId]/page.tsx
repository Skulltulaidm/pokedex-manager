"use client";

import { useParams, useRouter } from "next/navigation";

import { MessageThread } from "@/components/message-thread";

export default function ThreadPage() {
  const { partnerId } = useParams<{ partnerId: string }>();
  const router = useRouter();

  return (
    <MessageThread
      key={partnerId}
      partnerId={partnerId}
      onBack={() => router.push("/messages")}
    />
  );
}
