<script lang="ts">
  import "./layout.css";
  import DevLog from "$lib/components/DevLog.svelte";
  import { Toaster } from "$lib/components/ui/sonner/index.js";

  let { children } = $props();

  const devMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("dev");
</script>

<svelte:head><link rel="icon" href="/favicon.png" /></svelte:head>
{#if devMode}
  <DevLog />
{/if}
<Toaster />
{@render children()}
