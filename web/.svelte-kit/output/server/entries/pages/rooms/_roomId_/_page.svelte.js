import { b as attr_class, c as clsx, f as attr_style, e as escape_html, h as ensure_array_like, a as attr, d as derived, i as store_get, u as unsubscribe_stores } from "../../../../chunks/root.js";
import { c as cn, g as getVoiceState, o as onDestroy, R as Room_sidebar, V as Voice_controls, d as disconnectWs, p as page } from "../../../../chunks/voice-controls.js";
import "@sveltejs/kit/internal";
import "../../../../chunks/exports.js";
import "../../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../../chunks/state.svelte.js";
import "clsx";
let _messages = [];
function getChatMessages() {
  return _messages;
}
function Participant_tile($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { participant } = $$props;
    $$renderer2.push(`<div${attr_class(clsx(cn("flex items-center gap-2 rounded-lg border px-3 py-2", participant.isSpeaking ? "border-primary bg-lag-accent-dim" : "border-border bg-surface")))}${attr_style("", {
      animation: participant.isSpeaking ? "speaking-pulse 1.5s ease-in-out infinite" : "none"
    })}><div class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"${attr_style("", { "background-color": participant.avatarColor })}>${escape_html(participant.nickname?.charAt(0).toUpperCase() ?? "?")}</div> <div class="flex flex-col min-w-0"><span class="text-sm font-medium text-foreground truncate">${escape_html(participant.nickname)}</span> <span class="text-[10px] text-text-muted">`);
    if (participant.isMuted) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`Muted`);
    } else if (participant.isSpeaking) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`Speaking`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`Connected`);
    }
    $$renderer2.push(`<!--]--></span></div></div>`);
  });
}
function Room_view($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { roomId } = $$props;
    const voice = derived(getVoiceState);
    const messages = derived(getChatMessages);
    let messageInput = "";
    $$renderer2.push(`<div class="flex flex-1 flex-col overflow-hidden"><div class="flex items-center justify-between border-b border-border px-4 py-3"><h2 class="text-lg font-heading text-foreground">${escape_html(voice().roomId === roomId ? voice().roomName ?? "Room" : "Room")}</h2></div> `);
    if (voice().roomId === roomId && voice().participants.length > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="border-b border-border p-4"><div class="flex flex-wrap gap-3"><!--[-->`);
      const each_array = ensure_array_like(voice().participants);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let participant = each_array[$$index];
        Participant_tile($$renderer2, { participant });
      }
      $$renderer2.push(`<!--]--></div></div>`);
    } else if (voice().status === "connecting") {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="border-b border-border p-4 text-center text-sm text-text-secondary">Connecting to voice...</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">`);
    if (messages().length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="text-center text-sm text-text-muted py-8">No messages yet</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array_1 = ensure_array_like(messages());
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let msg = each_array_1[$$index_1];
      $$renderer2.push(`<div class="flex items-start gap-2.5"><div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"${attr_style("", { "background-color": msg.avatarColor })}>${escape_html(msg.nickname?.charAt(0).toUpperCase() ?? "?")}</div> <div class="min-w-0"><div class="flex items-baseline gap-2"><span class="text-sm font-semibold text-foreground">${escape_html(msg.nickname)}</span> <span class="text-[10px] text-text-muted">${escape_html(new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</span></div> <p class="text-sm text-text-secondary break-words">${escape_html(msg.content)}</p></div></div>`);
    }
    $$renderer2.push(`<!--]--></div> <form class="border-t border-border p-3"><div class="flex gap-2"><input type="text"${attr("value", messageInput)} placeholder="Type a message..."${attr("maxlength", 2e3)} class="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"/> <button type="submit"${attr("disabled", !messageInput.trim(), true)} class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">Send</button></div></form></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const voice = derived(getVoiceState);
    const roomId = derived(() => store_get($$store_subs ??= {}, "$page", page).params.roomId ?? "");
    onDestroy(() => {
      disconnectWs();
    });
    $$renderer2.push(`<div class="flex h-screen bg-background">`);
    Room_sidebar($$renderer2);
    $$renderer2.push(`<!----> <div class="flex flex-1 flex-col">`);
    Room_view($$renderer2, { roomId: roomId() });
    $$renderer2.push(`<!----></div> `);
    if (voice().status !== "disconnected") {
      $$renderer2.push("<!--[0-->");
      Voice_controls($$renderer2);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
