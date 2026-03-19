import { j as ssr_context, g as getContext, h as ensure_array_like, b as attr_class, c as clsx$1, e as escape_html, f as attr_style, d as derived, i as store_get, u as unsubscribe_stores } from "./root.js";
import { clsx } from "clsx";
import "@sveltejs/kit/internal";
import "./exports.js";
import "./utils.js";
import "@sveltejs/kit/internal/server";
import "./state.svelte.js";
import { g as getSessionState } from "./session.svelte.js";
import "livekit-client";
import { twMerge } from "tailwind-merge";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
let _rooms = [];
function getRooms() {
  return _rooms;
}
const initialState = {
  status: "disconnected",
  roomId: null,
  roomName: null,
  muted: false,
  deafened: false,
  participants: [],
  localSpeaking: false
};
let _state = { ...initialState };
function getVoiceState() {
  return _state;
}
let ws = null;
function disconnectWs() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  cleanup();
}
function cleanup() {
  ws = null;
}
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
function Room_sidebar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const rooms = derived(getRooms);
    const session = derived(getSessionState);
    const currentRoomId = derived(() => store_get($$store_subs ??= {}, "$page", page).params.roomId);
    $$renderer2.push(`<aside class="flex h-full w-64 flex-col border-r border-border bg-card"><div class="flex items-center justify-between border-b border-border p-4"><h1 class="text-lg font-heading text-foreground">Lag</h1> <button class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110">New Room</button></div> <div class="flex-1 overflow-y-auto p-2">`);
    if (rooms().length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="px-2 py-4 text-center text-sm text-text-muted">No rooms yet</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <!--[-->`);
    const each_array = ensure_array_like(rooms());
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let room = each_array[$$index];
      $$renderer2.push(`<button${attr_class(clsx$1(cn("flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors", currentRoomId() === room.id ? "bg-surface-hover text-foreground" : "text-text-secondary hover:bg-surface hover:text-foreground")))}><span class="truncate text-sm font-medium">${escape_html(room.name)}</span> `);
      if (room.participantCount > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="ml-2 flex items-center gap-1 text-xs text-lag-success"><span class="h-1.5 w-1.5 rounded-full bg-lag-success"></span> ${escape_html(room.participantCount)}</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="border-t border-border p-3"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><div class="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"${attr_style("", { "background-color": session().user?.avatarColor ?? "#43b8b0" })}>${escape_html(session().user?.nickname?.charAt(0).toUpperCase() ?? "?")}</div> <span class="text-sm font-medium text-foreground truncate max-w-[120px]">${escape_html(session().user?.nickname)}</span></div> <button class="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-foreground">Leave</button></div></div></aside> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function Voice_controls($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const voice = derived(getVoiceState);
    $$renderer2.push(`<div class="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card"><div class="mx-auto flex max-w-lg items-center justify-center gap-4 px-4 py-3"><div class="flex items-center gap-2 text-sm text-text-secondary"><span${attr_class("h-2 w-2 rounded-full", void 0, {
      "bg-lag-success": voice().status === "connected",
      "bg-lag-warning": voice().status === "reconnecting",
      "bg-text-muted": voice().status === "connecting"
    })}></span> <span class="truncate max-w-[120px]">${escape_html(voice().roomName ?? "Voice")}</span></div> <div class="flex items-center gap-2"><button${attr_class(clsx$1(cn("rounded-lg px-3 py-2 text-xs font-medium", voice().muted ? "bg-lag-danger text-white hover:bg-lag-danger-hover" : "bg-surface text-foreground hover:bg-surface-hover")))}>${escape_html(voice().muted ? "Unmute" : "Mute")}</button> <button${attr_class(clsx$1(cn("rounded-lg px-3 py-2 text-xs font-medium", voice().deafened ? "bg-lag-danger text-white hover:bg-lag-danger-hover" : "bg-surface text-foreground hover:bg-surface-hover")))}>${escape_html(voice().deafened ? "Undeafen" : "Deafen")}</button> <button class="rounded-lg bg-lag-danger px-3 py-2 text-xs font-medium text-white hover:bg-lag-danger-hover">Disconnect</button></div></div></div>`);
  });
}
export {
  Room_sidebar as R,
  Voice_controls as V,
  cn as c,
  disconnectWs as d,
  getVoiceState as g,
  onDestroy as o,
  page as p
};
