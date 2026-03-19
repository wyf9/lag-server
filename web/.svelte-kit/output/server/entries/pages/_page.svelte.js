import { a as attr, e as escape_html, d as derived } from "../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/state.svelte.js";
import { g as getSessionState } from "../../chunks/session.svelte.js";
function Nickname_form($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let nickname = "";
    let loading = false;
    $$renderer2.push(`<form class="space-y-4"><div><label for="nickname" class="block text-sm font-medium text-text-secondary mb-1.5">Choose a nickname</label> <input id="nickname" type="text"${attr("value", nickname)} placeholder="Enter your nickname"${attr("maxlength", 64)} class="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground placeholder:text-text-muted focus:border-primary focus:ring-1 focus:ring-primary outline-none"${attr("disabled", loading, true)}/></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button type="submit"${attr("disabled", !nickname.trim() || loading, true)} class="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed">${escape_html("Join")}</button></form>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const session = derived(getSessionState);
    $$renderer2.push(`<div class="flex min-h-screen items-center justify-center bg-background"><div class="w-full max-w-md px-6"><div class="mb-8 text-center"><h1 class="text-4xl font-heading text-foreground mb-2">Lag</h1> <p class="text-text-secondary text-sm">Self-hosted voice communication</p></div> `);
    if (session().loaded && !session().token) {
      $$renderer2.push("<!--[0-->");
      Nickname_form($$renderer2);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="flex justify-center"><div class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
