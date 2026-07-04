import type { Ref } from "vue";

export async function submitChatDraft(
  draft: Pick<Ref<string>, "value">,
  sendMessage: (text: string) => Promise<void>
): Promise<void> {
  const text = draft.value.trim();
  if (!text) {
    return;
  }
  draft.value = "";
  await sendMessage(text);
}
