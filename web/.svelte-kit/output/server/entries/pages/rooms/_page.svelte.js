import { e as escape_html, d as derived } from "../../../chunks/root.js";
import { o as onDestroy, R as Room_sidebar, V as Voice_controls, g as getVoiceState, d as disconnectWs } from "../../../chunks/voice-controls.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/state.svelte.js";
import { g as getSessionState } from "../../../chunks/session.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const session = derived(getSessionState);
    const voice = derived(getVoiceState);
    onDestroy(() => {
      disconnectWs();
    });
    $$renderer2.push(`<div class="flex h-screen bg-background">`);
    Room_sidebar($$renderer2);
    $$renderer2.push(`<!----> <div class="flex flex-1 flex-col items-center justify-center"><div class="text-center"><h2 class="text-2xl font-heading text-foreground mb-2">Welcome, ${escape_html(session().user?.nickname)}</h2> <p class="text-text-secondary text-sm">Select a room from the sidebar or create a new one</p></div></div> `);
    if (voice().status !== "disconnected") {
      $$renderer2.push("<!--[0-->");
      Voice_controls($$renderer2);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
