export function validateAnnouncement(
  title: string,
  body: string,
): string | null {
  if (!title.trim() || !body.trim()) return "제목과 내용을 모두 입력해 주세요.";
  if ([...title].length > 80) return "제목은 80자까지 입력할 수 있습니다.";
  if ([...body].length > 1000) return "내용은 1,000자까지 입력할 수 있습니다.";
  if (
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      title + body,
    )
  )
    return "올바르지 않은 문자가 포함되어 있습니다.";
  if (
    new TextEncoder().encode(
      JSON.stringify({
        topic: "documents",
        notification: { title, body },
        android: { notification: { channelId: "fcm_messages" } },
      }),
    ).length > 2048
  )
    return "알림 데이터가 너무 큽니다. 이모지나 내용을 줄여 주세요.";
  return null;
}
